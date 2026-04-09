import { pipedrive } from './pipedrive';
import { PD_FIELDS } from '../config';
import logger from '../utils/logger';

const REMINDER_CHECKLIST = `In zwei Tagen steht ein Vor Ort Termin an. Bitte prüfe final, ob alle Unterlagen vorhanden sind:

-Wurde der Termin bestätigt?
-Liegt die Rückmeldung vom Factoring vor?
-Liegen alle relevanten Unterlagen vollständig vor?
-Liegt die Vollmacht vor?
-Wurden die Schlüssel organisiert?`;

/**
 * Subtracts days from a YYYY-MM-DD date string.
 */
function subtractDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Creates an on-site appointment and a reminder (2 days before) in Pipedrive.
 */
export async function createAppointmentWithReminder(
  dealId: number,
): Promise<{ appointmentId: number; reminderId: number }> {
  // 1. Get deal data
  const deal = await pipedrive.getDeal(dealId);

  const terminDatum = deal[PD_FIELDS.TERMIN_DATUM] as string | undefined;
  const terminUhrzeit = deal[PD_FIELDS.TERMIN_UHRZEIT] as string | undefined;
  const objektadresseKey = `${PD_FIELDS.OBJEKTADRESSE}_formatted_address`;
  const objektadresse = deal[objektadresseKey] as string | undefined;
  const svUserId = deal[PD_FIELDS.SV] as number | undefined;

  if (!terminDatum) {
    logger.warn({ dealId }, 'No Termin-Datum found on deal, skipping scheduling');
    throw new Error(`Deal ${dealId} has no Termin-Datum`);
  }

  logger.info(
    { dealId, terminDatum, terminUhrzeit, svUserId },
    'Creating appointment with reminder',
  );

  // 2. Create "Vor Ort Termin" activity
  const appointment = await pipedrive.createActivity({
    subject: 'Vor Ort Termin',
    type: 'vor_ort_termin',
    due_date: terminDatum,
    due_time: terminUhrzeit || undefined,
    user_id: svUserId || undefined,
    deal_id: dealId,
  });

  // Set location on the activity
  if (objektadresse) {
    await pipedrive.updateActivity(appointment.id, { location: objektadresse } as any);
  }

  logger.info({ appointmentId: appointment.id, dealId }, 'Vor Ort Termin created');

  // 3. Create reminder (2 days before)
  const reminderDate = subtractDays(terminDatum, 2);

  const reminder = await pipedrive.createActivity({
    subject: 'Vor Ort Termin - final Check',
    type: 'task',
    due_date: reminderDate,
    due_time: '09:00',
    user_id: svUserId || undefined,
    deal_id: dealId,
  });

  // Set checklist note on reminder
  await pipedrive.updateActivity(reminder.id, { note: REMINDER_CHECKLIST } as any);

  logger.info({ reminderId: reminder.id, reminderDate, dealId }, 'Reminder created');

  return { appointmentId: appointment.id, reminderId: reminder.id };
}
