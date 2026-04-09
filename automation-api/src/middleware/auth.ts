import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Middleware: Prüft x-webhook-secret Header gegen WEBHOOK_SECRET env var.
 * Wird auf alle Lead- und Webhook-Routen angewendet.
 */
export function verifyWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-webhook-secret'] as string;

  if (!config.webhookSecret) {
    // Kein Secret konfiguriert → in Dev-Umgebung durchlassen, in Prod blocken
    if (config.nodeEnv === 'production') {
      logger.error('WEBHOOK_SECRET not configured in production!');
      res.status(500).json({ success: false, error: 'Server misconfigured' });
      return;
    }
    next();
    return;
  }

  if (secret !== config.webhookSecret) {
    logger.warn({ path: req.path, ip: req.ip }, 'Unauthorized webhook attempt');
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  next();
}

/**
 * Middleware: Prüft PandaDoc Webhook-Signatur (HMAC).
 * Falls PANDADOC_WEBHOOK_SECRET nicht gesetzt, fällt auf verifyWebhookSecret zurück.
 */
export function verifyPandaDocSignature(req: Request, res: Response, next: NextFunction): void {
  // TODO: PandaDoc HMAC-Verifizierung implementieren wenn Secret vorhanden
  // Für jetzt: Fallback auf Standard-Webhook-Secret
  verifyWebhookSecret(req, res, next);
}
