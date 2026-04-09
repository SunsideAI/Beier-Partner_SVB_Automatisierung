/** Lead form / chatbot / voicebot request */
export interface LeadRequest {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  object_address?: string;
  interest?: string;
  message?: string;
  source: 'form';
}

/** PandaDoc webhook payload */
export interface PandaDocWebhookPayload {
  event: string;
  data: {
    id: string;
    name: string;
    status: string;
    recipients: Array<{
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      has_completed: boolean;
    }>;
    [key: string]: unknown;
  };
}

/** Gmail Pub/Sub push notification */
export interface GmailPushNotification {
  message: {
    data: string; // Base64-encoded
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

/** Pipedrive webhook payload (deal update) */
export interface PipedriveDealWebhook {
  v: number;
  event: string;
  current: {
    id: number;
    [key: string]: unknown;
  };
  previous: {
    id: number;
    [key: string]: unknown;
  };
  meta: {
    action: string;
    object: string;
    [key: string]: unknown;
  };
}
