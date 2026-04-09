import { pipedrive } from './pipedrive';
import { config, PD_FIELDS } from '../config';
import { extractFirstPage } from '../utils/pdf';
import logger from '../utils/logger';
import type { PandaDocWebhookPayload } from '../types/webhooks';
import { createAppointmentWithReminder } from './scheduling';

const COMPANY_EMAIL = 'kontakt@beierundpartner.de';

/**
 * Processes a PandaDoc webhook when a document status changes.
 * Handles: tax update, activity completion, stage change, appointment trigger, Vollmacht split.
 */
export async function processPandaDocWebhook(
  payload: PandaDocWebhookPayload,
): Promise<{ success: boolean; dealId?: number }> {
  const { recipients } = payload.data;

  logger.info(
    { docId: payload.data.id, status: payload.data.status, event: payload.event },
    'PandaDoc webhook received',
  );

  // Filter out company email, search remaining in Pipedrive
  const customerEmails = recipients
    .map((r) => r.email)
    .filter((email) => email.toLowerCase() !== COMPANY_EMAIL);

  if (customerEmails.length === 0) {
    logger.warn({ docId: payload.data.id }, 'No customer emails found in PandaDoc recipients');
    return { success: false };
  }

  // Search for person in Pipedrive
  let personId: number | null = null;
  for (const email of customerEmails) {
    const persons = await pipedrive.searchPersons(email);
    if (persons.length > 0) {
      personId = persons[0].id;
      break;
    }
  }

  if (!personId) {
    logger.warn(
      { emails: customerEmails, docId: payload.data.id },
      'No matching Pipedrive contact found for PandaDoc document',
    );
    return { success: false };
  }

  // Get open deals for person
  const deals = await pipedrive.getDealsForPerson(personId, 'open');
  if (deals.length === 0) {
    logger.warn({ personId }, 'No open deals found for person');
    return { success: false };
  }

  const deal = deals[0];
  const dealId = deal.id;
  logger.info({ dealId, personId }, 'Processing contract for deal');

  // a. Update tax on all products (Tax: 19, Method: inclusive)
  await updateDealProductTax(dealId);

  // b. Mark "Vertrag unterschrieben?" activity as done
  await markContractActivityDone(dealId);

  // c. Move deal to "Vertrag unterschrieben" stage
  await pipedrive.updateDeal(dealId, { stage_id: PD_FIELDS.STAGE_VERTRAG_UNTERSCHRIEBEN } as any);
  logger.info({ dealId }, 'Deal moved to stage: Vertrag unterschrieben');

  // d. If appointment date exists, trigger scheduling
  const terminDatum = deal[PD_FIELDS.TERMIN_DATUM] as string | undefined;
  if (terminDatum) {
    logger.info({ dealId, terminDatum }, 'Appointment date found, triggering scheduling');
    await createAppointmentWithReminder(dealId);
  }

  // e. Vollmacht split (if applicable)
  await processVollmachtSplit(dealId);

  return { success: true, dealId };
}

/**
 * Updates tax on all products in a deal to 19% inclusive.
 */
export async function updateDealProductTax(dealId: number): Promise<void> {
  const products = await pipedrive.listProductsInDeal(dealId);

  for (const product of products) {
    await pipedrive.updateProductInDeal(dealId, product.id, {
      tax: 19,
      tax_method: 'inclusive',
      item_price: product.item_price,
      quantity: product.quantity,
    });
  }

  logger.info({ dealId, productCount: products.length }, 'Product taxes updated');
}

/**
 * Marks the "Vertrag unterschrieben?" activity as done.
 */
async function markContractActivityDone(dealId: number): Promise<void> {
  const activities = await pipedrive.getActivitiesForDeal(dealId);
  const contractActivity = activities.find((a) =>
    a.subject.toLowerCase().includes('vertrag unterschrieben'),
  );

  if (contractActivity) {
    await pipedrive.updateActivity(contractActivity.id, { done: true } as any);
    logger.info({ activityId: contractActivity.id, dealId }, 'Contract activity marked as done');
  } else {
    logger.warn({ dealId }, 'No "Vertrag unterschrieben?" activity found');
  }
}

/**
 * Splits the Vollmacht (first page) from the Sachverständigenvertrag PDF.
 * Only applies when Rahmenvertrag = "Nein" AND Sonderbedingung = "Nein".
 */
async function processVollmachtSplit(dealId: number): Promise<void> {
  const deal = await pipedrive.getDeal(dealId);

  const rahmenvertrag = deal[PD_FIELDS.RAHMENVERTRAG];
  const sonderbedingung = deal[PD_FIELDS.SONDERBEDINGUNG];

  // Bug 4: Vergleich mit Option-IDs statt String-Literalen (Pipedrive Select-Felder)
  const isRahmenvertrag = String(rahmenvertrag) === String(PD_FIELDS.RAHMENVERTRAG_JA);
  const isSonderbedingung = String(sonderbedingung) === String(PD_FIELDS.SONDERBEDINGUNG_JA);
  if (isRahmenvertrag || isSonderbedingung) {
    logger.info({ dealId, rahmenvertrag, sonderbedingung }, 'Skipping Vollmacht split (Rahmenvertrag or Sonderbedingung = Ja)');
    return;
  }

  // Find Sachverständigenvertrag file — Bug 8: Umlaut-Fallback
  const files = await pipedrive.listDealFiles(dealId);
  const svFile = files.find((f) => {
    const name = f.name.toLowerCase();
    const fileName = f.file_name.toLowerCase();
    return (
      name.includes('sachverständigenvertrag') ||
      name.includes('sachverstaendigenvertrag') ||
      name.includes('sv-vertrag') ||
      fileName.includes('sachverständigenvertrag') ||
      fileName.includes('sachverstaendigenvertrag') ||
      fileName.includes('sv-vertrag')
    );
  });

  if (!svFile) {
    logger.warn({ dealId }, 'No Sachverständigenvertrag file found for Vollmacht split');
    return;
  }

  // Download PDF, extract first page, upload as Vollmacht
  const pdfBuffer = await pipedrive.downloadFile(svFile.id);
  const vollmachtBuffer = await extractFirstPage(pdfBuffer);
  await pipedrive.uploadFile(dealId, 'Vollmacht', vollmachtBuffer);

  logger.info({ dealId, sourceFileId: svFile.id }, 'Vollmacht extracted and uploaded');
}

/**
 * Processes a Pipedrive deal webhook for tax updates on new deals.
 * Only applies when Rahmenvertrag = "Nein".
 */
export async function processNewDealTax(dealId: number): Promise<void> {
  const deal = await pipedrive.getDeal(dealId);

  const rahmenvertrag = deal[PD_FIELDS.RAHMENVERTRAG];
  // Bug 4: Vergleich mit Option-ID statt String-Literal
  if (String(rahmenvertrag) === String(PD_FIELDS.RAHMENVERTRAG_JA)) {
    logger.info({ dealId, rahmenvertrag }, 'Skipping tax update (Rahmenvertrag = Ja)');
    return;
  }

  await updateDealProductTax(dealId);
  logger.info({ dealId }, 'Tax updated for new deal (non-Rahmenvertrag)');
}
