import axios from 'axios';
import { config, PD_FIELDS } from '../config';
import { pipedrive } from './pipedrive';
import { sendInfoAlert } from './notifications';
import logger from '../utils/logger';
import type { GmailPushNotification } from '../types/webhooks';

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType: string;
  body: { data?: string; size: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: GmailMessageHeader[];
    body: { data?: string; size: number };
    parts?: GmailMessagePart[];
    mimeType: string;
  };
}

type FactoringStatus = 'ja' | 'nein' | 'unklar';

/**
 * Gets a fresh access token using the stored refresh token.
 */
async function getGmailAccessToken(): Promise<string> {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    refresh_token: config.google.refreshToken,
    grant_type: 'refresh_token',
  });
  return res.data.access_token;
}

/**
 * Extracts the text body from a Gmail message (handles multipart).
 */
function extractBody(message: GmailMessage): string {
  const { payload } = message;

  // Simple body
  if (payload.body.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  // Multipart — find text/plain
  if (payload.parts) {
    const textPart = findTextPart(payload.parts);
    if (textPart?.body.data) {
      return Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
    }
  }

  // Fallback to snippet
  return message.snippet;
}

function findTextPart(parts: GmailMessagePart[]): GmailMessagePart | null {
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body.data) return part;
    if (part.parts) {
      const found = findTextPart(part.parts);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Parses the factoring decision from the email body.
 */
function parseFactoringDecision(body: string): FactoringStatus {
  const lower = body.toLowerCase();

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
 * Extracts a Pipedrive deal reference from the email subject line.
 * Looks for patterns like "Deal #1234" or "Auftrag 1234".
 */
function extractDealReference(subject: string): number | null {
  const patterns = [
    /deal\s*#?\s*(\d+)/i,
    /auftrag\s*#?\s*(\d+)/i,
    /#(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Processes a Gmail push notification for aifinyo factoring emails.
 */
export async function processGmailNotification(
  notification: GmailPushNotification,
): Promise<{ processed: boolean; status?: FactoringStatus; dealId?: number }> {
  // 1. Decode Pub/Sub message
  const decoded = JSON.parse(
    Buffer.from(notification.message.data, 'base64').toString('utf-8'),
  );
  const { emailAddress, historyId } = decoded;

  logger.info({ emailAddress, historyId }, 'Gmail push notification received');

  // 2. Get access token and fetch recent messages
  const accessToken = await getGmailAccessToken();
  const gmailApi = axios.create({
    baseURL: 'https://gmail.googleapis.com/gmail/v1',
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });

  // Fetch recent messages from history
  const historyRes = await gmailApi.get(`/users/me/history`, {
    params: { startHistoryId: historyId, historyTypes: 'messageAdded' },
  });

  const histories = historyRes.data.history || [];
  let processedAny = false;
  let lastStatus: FactoringStatus | undefined;
  let lastDealId: number | undefined;

  for (const history of histories) {
    for (const added of history.messagesAdded || []) {
      const messageId = added.message.id;

      // Fetch full message
      const msgRes = await gmailApi.get<GmailMessage>(
        `/users/me/messages/${messageId}`,
        { params: { format: 'full' } },
      );
      const message = msgRes.data;

      // Check sender
      const fromHeader = message.payload.headers.find(
        (h) => h.name.toLowerCase() === 'from',
      );
      const from = fromHeader?.value || '';

      if (!from.includes('aifinyo.de')) {
        logger.debug({ from, messageId }, 'Not from aifinyo, skipping');
        continue;
      }

      logger.info({ from, messageId }, 'Processing aifinyo email');

      // 3. Extract and parse body
      const body = extractBody(message);
      const status = parseFactoringDecision(body);

      // 4. Find deal in Pipedrive
      const subjectHeader = message.payload.headers.find(
        (h) => h.name.toLowerCase() === 'subject',
      );
      const subject = subjectHeader?.value || '';
      const dealId = extractDealReference(subject);

      if (!dealId) {
        logger.warn({ subject, messageId }, 'Could not extract deal reference from aifinyo email');
        continue;
      }

      // 5. Update deal in Pipedrive
      if (status === 'ja') {
        await pipedrive.updateDeal(dealId, {
          [PD_FIELDS.FACTORING]: PD_FIELDS.FACTORING_JA,
        } as any);
        logger.info({ dealId, status }, 'Deal updated: Factoring = Ja');
      } else if (status === 'nein') {
        await pipedrive.updateDeal(dealId, {
          [PD_FIELDS.FACTORING]: PD_FIELDS.FACTORING_NEIN,
        } as any);
        logger.info({ dealId, status }, 'Deal updated: Factoring = Nein');
      } else {
        // Bug 5: Status "unklar" — Pipedrive-Aktivität für manuelle Prüfung anlegen
        logger.warn(
          { dealId, status, subject, snippet: message.snippet },
          'Factoring status unclear — manual review required',
        );

        const alertDetails = `Eine aifinyo-E-Mail konnte nicht eindeutig zugeordnet werden.\n\nDeal ID: ${dealId}\nBetreff: ${subject}\nVorschau: ${message.snippet}\n\nBitte E-Mail manuell pruefen und Factoring-Status setzen.`;

        await pipedrive.createActivity({
          subject: 'Factoring unklar — manuelle Pruefung noetig',
          type: 'task',
          due_date: new Date().toISOString().split('T')[0],
          deal_id: dealId,
          note: alertDetails,
        });

        await sendInfoAlert('Factoring unklar — manuelle Pruefung noetig', alertDetails);
      }

      processedAny = true;
      lastStatus = status;
      lastDealId = dealId;
    }
  }

  return { processed: processedAny, status: lastStatus, dealId: lastDealId };
}
