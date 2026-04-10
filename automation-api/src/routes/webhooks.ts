import { Router, Request, Response } from 'express';
import { processPandaDocWebhook, processNewDealTax } from '../services/contracts';
import { checkOpenFactoringDeals } from '../services/factoring';
import { createAppointmentWithReminder } from '../services/scheduling';
import { verifyWebhookSecret, verifyPandaDocSignature } from '../middleware/auth';
import { sendErrorAlert } from '../services/notifications';
import logger from '../utils/logger';
import { AppError } from '../utils/errors';
import type { PandaDocWebhookPayload, PipedriveDealWebhook } from '../types/webhooks';
import { PD_FIELDS } from '../config';

const router = Router();

// ── PandaDoc Webhook ──

router.post('/webhooks/pandadoc', verifyPandaDocSignature, async (req: Request, res: Response) => {
  const start = Date.now();

  try {
    const payload = req.body as PandaDocWebhookPayload;
    logger.info({ event: payload.event, docId: payload.data?.id }, 'PandaDoc webhook received');

    const result = await processPandaDocWebhook(payload);

    const duration = Date.now() - start;
    logger.info({ duration, ...result }, 'PandaDoc webhook processed');
    res.json(result);
  } catch (error) {
    const duration = Date.now() - start;
    if (error instanceof AppError) {
      logger.error({ duration, error: error.message }, 'PandaDoc webhook failed');
      await sendErrorAlert(req.path, error, req.body);
      res.status(error.statusCode).json({ success: false, error: error.message });
    } else {
      logger.error({ duration, error }, 'PandaDoc webhook unexpected error');
      await sendErrorAlert(req.path, error, req.body);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
});

// ── Factoring Check (manueller Trigger) ──

router.post('/webhooks/factoring/check', verifyWebhookSecret, async (req: Request, res: Response) => {
  const start = Date.now();

  try {
    logger.info('Manual factoring check triggered');
    const result = await checkOpenFactoringDeals();

    const duration = Date.now() - start;
    logger.info({ duration, ...result }, 'Manual factoring check completed');
    res.json({ success: true, ...result, duration_ms: duration });
  } catch (error) {
    const duration = Date.now() - start;
    if (error instanceof AppError) {
      logger.error({ duration, error: error.message }, 'Factoring check failed');
      await sendErrorAlert(req.path, error, req.body);
      res.status(error.statusCode).json({ success: false, error: error.message });
    } else {
      logger.error({ duration, error }, 'Factoring check unexpected error');
      await sendErrorAlert(req.path, error, req.body);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
});

// ── Pipedrive Webhook: Termin ──

router.post('/webhooks/pipedrive/termin', verifyWebhookSecret, async (req: Request, res: Response) => {
  const start = Date.now();

  try {
    const payload = req.body as PipedriveDealWebhook;
    const dealId = payload.current?.id;

    if (!dealId) {
      res.status(400).json({ success: false, error: 'No deal ID in webhook payload' });
      return;
    }

    // Check if Termin-Datum was actually updated
    const terminDatumChanged =
      payload.current[PD_FIELDS.TERMIN_DATUM] !== payload.previous[PD_FIELDS.TERMIN_DATUM];

    if (!terminDatumChanged) {
      logger.info({ dealId }, 'Termin-Datum not changed, skipping');
      res.json({ success: true, skipped: true });
      return;
    }

    logger.info({ dealId }, 'Pipedrive termin webhook received');
    const result = await createAppointmentWithReminder(dealId);

    const duration = Date.now() - start;
    logger.info({ duration, dealId, ...result }, 'Termin webhook processed');
    res.json({ success: true, ...result });
  } catch (error) {
    const duration = Date.now() - start;
    if (error instanceof AppError) {
      logger.error({ duration, error: error.message }, 'Termin webhook failed');
      await sendErrorAlert(req.path, error, req.body);
      res.status(error.statusCode).json({ success: false, error: error.message });
    } else {
      logger.error({ duration, error }, 'Termin webhook unexpected error');
      await sendErrorAlert(req.path, error, req.body);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
});

// ── Pipedrive Webhook: Deal (Steuersatz) ──

router.post('/webhooks/pipedrive/deal', verifyWebhookSecret, async (req: Request, res: Response) => {
  const start = Date.now();

  try {
    const payload = req.body as PipedriveDealWebhook;
    const dealId = payload.current?.id;

    if (!dealId) {
      res.status(400).json({ success: false, error: 'No deal ID in webhook payload' });
      return;
    }

    // Only process new deals (action: added)
    if (payload.meta?.action !== 'added') {
      logger.info({ dealId, action: payload.meta?.action }, 'Not a new deal, skipping');
      res.json({ success: true, skipped: true });
      return;
    }

    logger.info({ dealId }, 'Pipedrive deal webhook received');
    await processNewDealTax(dealId);

    const duration = Date.now() - start;
    logger.info({ duration, dealId }, 'Deal tax webhook processed');
    res.json({ success: true, dealId });
  } catch (error) {
    const duration = Date.now() - start;
    if (error instanceof AppError) {
      logger.error({ duration, error: error.message }, 'Deal webhook failed');
      await sendErrorAlert(req.path, error, req.body);
      res.status(error.statusCode).json({ success: false, error: error.message });
    } else {
      logger.error({ duration, error }, 'Deal webhook unexpected error');
      await sendErrorAlert(req.path, error, req.body);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
});

export default router;
