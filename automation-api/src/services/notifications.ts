import { Resend } from 'resend';
import { config } from '../config';
import logger from '../utils/logger';

let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!config.resend.apiKey) return null;
  if (!resend) {
    resend = new Resend(config.resend.apiKey);
  }
  return resend;
}

/**
 * Strips sensitive fields (tokens, passwords, secrets) from a request body for logging.
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;

  const sensitiveKeys = ['password', 'token', 'secret', 'api_key', 'apikey', 'authorization'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Sends an error alert email. Falls back to logging if Resend is not configured.
 */
export async function sendErrorAlert(
  endpoint: string,
  error: unknown,
  requestBody?: unknown,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error ? error.stack : undefined;
  const sanitizedBody = requestBody ? sanitizeBody(requestBody) : undefined;

  const client = getResendClient();
  if (!client) {
    logger.warn(
      { endpoint, errorMessage, timestamp },
      'RESEND_API_KEY not configured — error alert not sent',
    );
    return;
  }

  const subject = `[Automation API] Fehler: ${endpoint} — ${errorMessage}`;

  const body = [
    `Timestamp: ${timestamp}`,
    `Endpunkt: ${endpoint}`,
    `Error: ${errorMessage}`,
    '',
    stackTrace ? `Stack Trace:\n${stackTrace}` : null,
    '',
    sanitizedBody ? `Request Body:\n${JSON.stringify(sanitizedBody, null, 2)}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');

  try {
    await client.emails.send({
      from: config.resend.alertEmailFrom,
      to: config.resend.alertEmailTo,
      subject,
      text: body,
    });
    logger.info({ endpoint, to: config.resend.alertEmailTo }, 'Error alert email sent');
  } catch (emailError) {
    logger.error({ emailError, endpoint }, 'Failed to send error alert email');
  }
}

/**
 * Sends an info alert for cases needing manual review (e.g. unclear factoring status).
 */
export async function sendInfoAlert(
  subject: string,
  details: string,
): Promise<void> {
  const client = getResendClient();
  if (!client) {
    logger.warn({ subject }, 'RESEND_API_KEY not configured — info alert not sent');
    return;
  }

  const body = `Timestamp: ${new Date().toISOString()}\n\n${details}`;

  try {
    await client.emails.send({
      from: config.resend.alertEmailFrom,
      to: config.resend.alertEmailTo,
      subject: `[Automation API] ${subject}`,
      text: body,
    });
    logger.info({ subject, to: config.resend.alertEmailTo }, 'Info alert email sent');
  } catch (emailError) {
    logger.error({ emailError, subject }, 'Failed to send info alert email');
  }
}
