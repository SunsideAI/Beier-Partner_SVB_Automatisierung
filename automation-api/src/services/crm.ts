import { pipedrive } from './pipedrive';
import { getAnrede } from './gender';
import { geocodeAddress } from './geocoding';
import { config, PD_FIELDS } from '../config';
import logger from '../utils/logger';
import { ValidationError } from '../utils/errors';
import type { LeadRequest } from '../types/webhooks';
import type { CreateLeadInput } from '../types/pipedrive';

interface CrmResult {
  success: boolean;
  lead_id: string;
  person_id: number;
  source: string;
  duplicate: boolean;
}

/**
 * Processes an incoming lead from any source (form, chatbot, voicebot).
 * Handles duplicate check, gender detection, geocoding, and CRM creation.
 */
export async function processLead(input: LeadRequest): Promise<CrmResult> {
  const { name, email, phone, address, object_address, interest, message, source } = input;

  if (!name || !email) {
    throw new ValidationError('Name and email are required');
  }

  const firstName = name.split(' ')[0];
  logger.info({ name, email, source }, 'Processing new lead');

  // 1. Duplicate check
  const existingPersons = await pipedrive.searchPersons(email);
  let personId: number;
  let isDuplicate = false;

  if (existingPersons.length > 0) {
    // Contact exists — use existing person, create new lead only
    personId = existingPersons[0].id;
    isDuplicate = true;
    logger.info({ personId, email }, 'Duplicate contact found, skipping person creation');
  } else {
    // 2. Gender API → Anrede
    const anrede = await getAnrede(firstName);

    // 3. Geocoding (if object address provided)
    if (object_address) {
      await geocodeAddress(object_address);
    }

    // 4. Create Person
    const person = await pipedrive.createPerson({
      name,
      email: [{ value: email, primary: true }],
      phone: phone ? [{ value: phone, primary: true }] : undefined,
      owner_id: config.defaultOwnerId,
      // Anrede as label field
      label: anrede,
    });
    personId = person.id;
    logger.info({ personId, name }, 'Person created in Pipedrive');
  }

  // 5. Create Lead
  const leadData: CreateLeadInput = {
    title: `Neuer Lead: ${name}`,
    person_id: personId,
    owner_id: config.defaultOwnerId,
  };

  // Set Kundenadresse if provided
  if (address) {
    (leadData as any)[PD_FIELDS.KUNDENADRESSE] = address;
  }

  const lead = await pipedrive.createLead(leadData);
  logger.info({ leadId: lead.id, personId }, 'Lead created in Pipedrive');

  // 6. Create Note on Lead
  const noteContent = [
    `Quelle: ${source}`,
    interest ? `Interesse an: ${interest}` : null,
    message ? `Nachricht: ${message}` : null,
    address ? `Kundenadresse: ${address}` : null,
    object_address ? `Objektadresse: ${object_address}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await pipedrive.createNote(noteContent, { lead_id: lead.id });
  logger.info({ leadId: lead.id }, 'Note created on lead');

  return {
    success: true,
    lead_id: lead.id,
    person_id: personId,
    source,
    duplicate: isDuplicate,
  };
}
