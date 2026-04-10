import { pipedrive } from './pipedrive';
import { PD_FIELDS } from '../config';
import { sendInfoAlert } from './notifications';
import logger from '../utils/logger';

type FactoringStatus = 'ja' | 'nein' | 'unklar';

/**
 * Parst die Factoring-Entscheidung aus dem E-Mail-Text.
 */
function parseFactoringDecision(text: string): FactoringStatus {
  const lower = text.toLowerCase();

  const positivePatterns = [
    /\bja\b/,
    /\bzusage\b/,
    /\bgenehmigt\b/,
    /\bbewilligt\b/,
    /\bakzeptiert\b/,
    /\bfreigegeben\b/,
  ];

  const negativePatterns = [
    /\bnein\b/,
    /\babsage\b/,
    /\babgelehnt\b/,
    /\bnicht genehmigt\b/,
    /\bnicht bewilligt\b/,
    /\bstorniert\b/,
  ];

  const hasPositive = positivePatterns.some((p) => p.test(lower));
  const hasNegative = negativePatterns.some((p) => p.test(lower));

  if (hasPositive && !hasNegative) return 'ja';
  if (hasNegative && !hasPositive) return 'nein';
  return 'unklar';
}

/**
 * Prüft einen einzelnen Deal auf aifinyo-Antwort via Pipedrive Mail-API.
 */
async function checkDealForFactoringResponse(dealId: number): Promise<{
  found: boolean;
  status?: FactoringStatus;
}> {
  const mailMessages = await pipedrive.getDealMailMessages(dealId);

  for (const mail of mailMessages) {
    const fromAifinyo = mail.from?.some((sender) =>
      sender.email_address?.toLowerCase().includes('aifinyo.de'),
    );

    if (!fromAifinyo) continue;

    const textToCheck = mail.body || mail.snippet || '';
    const status = parseFactoringDecision(textToCheck);

    return { found: true, status };
  }

  return { found: false };
}

/**
 * Prüft alle offenen Factoring-Deals über die Pipedrive Mail-API.
 * Wird per Cron-Job oder manuell aufgerufen.
 */
export async function checkOpenFactoringDeals(): Promise<{
  checked: number;
  updated: number;
  unclear: number;
}> {
  logger.info('Starting scheduled factoring check');

  // 1. Alle offenen Deals holen, lokal filtern: Factoring-Feld leer
  const allDeals = await pipedrive.getOpenDeals();

  const openFactoringDeals = allDeals.filter((deal) => {
    const factoringValue = deal[PD_FIELDS.FACTORING];
    return !factoringValue || factoringValue === '' || factoringValue === null;
  });

  logger.info(
    { totalDeals: allDeals.length, openFactoring: openFactoringDeals.length },
    'Factoring deals to check',
  );

  let updated = 0;
  let unclear = 0;

  // 2. Jeden Deal prüfen
  for (const deal of openFactoringDeals) {
    try {
      const result = await checkDealForFactoringResponse(deal.id);

      if (!result.found) continue;

      if (result.status === 'ja') {
        await pipedrive.updateDeal(deal.id, {
          [PD_FIELDS.FACTORING]: PD_FIELDS.FACTORING_JA,
        } as any);
        logger.info({ dealId: deal.id }, 'Factoring set to Ja');
        updated++;
      } else if (result.status === 'nein') {
        await pipedrive.updateDeal(deal.id, {
          [PD_FIELDS.FACTORING]: PD_FIELDS.FACTORING_NEIN,
        } as any);
        logger.info({ dealId: deal.id }, 'Factoring set to Nein');
        updated++;
      } else {
        const alertDetails = `Deal ID: ${deal.id}\nDeal: ${deal.title}\n\nEine aifinyo-E-Mail konnte nicht eindeutig als Zusage oder Absage erkannt werden. Bitte E-Mail manuell pruefen und Factoring-Status setzen.`;

        await pipedrive.createActivity({
          subject: 'Factoring unklar — manuelle Pruefung noetig',
          type: 'task',
          due_date: new Date().toISOString().split('T')[0],
          deal_id: deal.id,
          note: alertDetails,
        });

        await sendInfoAlert('Factoring unklar — manuelle Pruefung noetig', alertDetails);

        logger.warn({ dealId: deal.id }, 'Factoring status unclear');
        unclear++;
      }
    } catch (error) {
      logger.error({ dealId: deal.id, error }, 'Error checking deal for factoring');
    }
  }

  logger.info(
    { checked: openFactoringDeals.length, updated, unclear },
    'Factoring check completed',
  );

  return { checked: openFactoringDeals.length, updated, unclear };
}
