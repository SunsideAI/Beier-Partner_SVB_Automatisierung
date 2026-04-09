import { Router, Request, Response } from 'express';
import { processLead } from '../services/crm';
import logger from '../utils/logger';
import { AppError } from '../utils/errors';
import type { LeadRequest } from '../types/webhooks';

const router = Router();

/**
 * Shared handler for all lead sources.
 * Normalizes input and delegates to CRM service.
 */
async function handleLead(req: Request, res: Response, source: LeadRequest['source']) {
  const start = Date.now();

  try {
    const input: LeadRequest = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      object_address: req.body.object_address,
      interest: req.body.interest,
      message: req.body.message,
      source,
    };

    logger.info({ source, email: input.email }, 'Lead webhook received');

    const result = await processLead(input);

    const duration = Date.now() - start;
    logger.info({ source, duration, leadId: result.lead_id }, 'Lead processed successfully');

    res.status(201).json(result);
  } catch (error) {
    const duration = Date.now() - start;
    if (error instanceof AppError) {
      logger.error({ source, duration, error: error.message }, 'Lead processing failed');
      res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    } else {
      logger.error({ source, duration, error }, 'Unexpected error processing lead');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}

// POST /leads/form — Website contact form
router.post('/leads/form', (req, res) => handleLead(req, res, 'form'));

// POST /leads/chatbot — Voiceflow webhook
router.post('/leads/chatbot', (req, res) => handleLead(req, res, 'chatbot'));

// POST /leads/voicebot — Retell webhook
router.post('/leads/voicebot', (req, res) => handleLead(req, res, 'voicebot'));

export default router;
