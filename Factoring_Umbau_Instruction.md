# Factoring-Service Umbau — Von Gmail Push auf Pipedrive Mail-API

## Kontext

Die aifinyo-E-Mails liegen bereits in Pipedrive an den jeweiligen Deals. 
Wir brauchen KEINEN Gmail-Zugriff. Stattdessen nutzen wir den Pipedrive-Endpoint 
`GET /deals/{id}/mailMessages` — exakt wie der alte Make.com-Workflow.

Pipedrive hat keinen Webhook für eingehende E-Mails, daher nutzen wir einen 
Scheduled Check (Cron-Job) der regelmäßig offene Factoring-Deals prüft.

## Änderungen

### 1. `src/services/factoring.ts` — Komplett umschreiben

Die Gmail-Logik (OAuth, Gmail API, Push-Notifications) komplett entfernen.
Neue Logik:

```typescript
/**
 * Prüft alle offenen Factoring-Deals über die Pipedrive Mail-API.
 * Wird per Cron-Job alle 30 Minuten aufgerufen.
 * 
 * Ablauf:
 * 1. Alle offenen Deals aus Pipedrive holen wo Factoring-Feld LEER ist
 * 2. Für jeden Deal: GET /deals/{id}/mailMessages
 * 3. E-Mails durchgehen: Absender enthält "aifinyo.de"?
 * 4. Wenn ja: Body/Snippet parsen → Ja/Nein/Unklar
 * 5. Deal-Feld "Factoring" auf Ja (Option-ID) oder Nein (Option-ID) setzen
 * 6. Bei "unklar": Pipedrive-Aktivität + Error-Mail ans Team
 */
```

Konkreter Ablauf:

```typescript
import { pipedrive } from './pipedrive';
import { PD_FIELDS } from '../config';
import logger from '../utils/logger';

type FactoringStatus = 'ja' | 'nein' | 'unklar';

/**
 * Parst die Factoring-Entscheidung aus dem E-Mail-Text.
 * Nutzt mehrere Muster für robuste Erkennung.
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
 * Prüft einen einzelnen Deal auf aifinyo-Antwort.
 */
async function checkDealForFactoringResponse(dealId: number): Promise<{
  found: boolean;
  status?: FactoringStatus;
}> {
  const mailMessages = await pipedrive.getDealMailMessages(dealId);

  for (const mail of mailMessages) {
    // Prüfe alle Absender
    const fromAifinyo = mail.from?.some((sender) =>
      sender.email_address?.toLowerCase().includes('aifinyo.de')
    );

    if (!fromAifinyo) continue;

    // aifinyo-Mail gefunden — Body oder Snippet parsen
    const textToCheck = mail.body || mail.snippet || '';
    const status = parseFactoringDecision(textToCheck);

    return { found: true, status };
  }

  return { found: false };
}

/**
 * Hauptfunktion: Prüft alle offenen Factoring-Deals.
 * Wird per Cron-Job aufgerufen.
 */
export async function checkOpenFactoringDeals(): Promise<{
  checked: number;
  updated: number;
  unclear: number;
}> {
  logger.info('Starting scheduled factoring check');

  // 1. Alle offenen Deals holen
  // Pipedrive API: GET /deals mit Filter auf offene Deals
  // Dann lokal filtern: Factoring-Feld ist leer/nicht gesetzt
  const allDeals = await pipedrive.getOpenDeals();
  
  const openFactoringDeals = allDeals.filter((deal) => {
    const factoringValue = deal[PD_FIELDS.FACTORING];
    return !factoringValue || factoringValue === '' || factoringValue === null;
  });

  logger.info({ totalDeals: allDeals.length, openFactoring: openFactoringDeals.length },
    'Factoring deals to check');

  let updated = 0;
  let unclear = 0;

  // 2. Jeden Deal prüfen
  for (const deal of openFactoringDeals) {
    try {
      const result = await checkDealForFactoringResponse(deal.id);

      if (!result.found) {
        // Keine aifinyo-Mail — Deal bleibt offen, nächstes Mal wieder prüfen
        continue;
      }

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
        // Unklar — Aktivität anlegen für manuelle Prüfung
        await pipedrive.createActivity({
          subject: 'Factoring unklar — manuelle Prüfung nötig',
          type: 'task',
          due_date: new Date().toISOString().split('T')[0],
          deal_id: deal.id,
          note: 'Eine aifinyo-E-Mail konnte nicht eindeutig als Zusage oder Absage erkannt werden. Bitte E-Mail manuell prüfen und Factoring-Status setzen.',
        });
        logger.warn({ dealId: deal.id }, 'Factoring status unclear');
        unclear++;
      }
    } catch (error) {
      logger.error({ dealId: deal.id, error }, 'Error checking deal for factoring');
    }
  }

  logger.info({ checked: openFactoringDeals.length, updated, unclear },
    'Factoring check completed');

  return { checked: openFactoringDeals.length, updated, unclear };
}
```

### 2. `src/services/pipedrive.ts` — Neue Methode hinzufügen

```typescript
/**
 * Holt alle offenen Deals (für Factoring-Check).
 * Nutzt den Deals-Endpoint mit status=open.
 */
async getOpenDeals(): Promise<Deal[]> {
  const allDeals: Deal[] = [];
  let start = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const res = await this.client.get<PipedriveResponse<Deal[]>>('/deals', {
      params: { status: 'open', start, limit },
    });
    
    const deals = res.data.data || [];
    allDeals.push(...deals);
    
    hasMore = res.data.additional_data?.pagination?.more_items_in_collection || false;
    start += limit;
  }

  return allDeals;
}
```

### 3. `src/index.ts` — Cron-Job einrichten

```typescript
import { checkOpenFactoringDeals } from './services/factoring';

// Cron-Job: Factoring-Check alle 30 Minuten
const FACTORING_INTERVAL_MS = 30 * 60 * 1000; // 30 Minuten

setInterval(async () => {
  try {
    await checkOpenFactoringDeals();
  } catch (error) {
    logger.error({ error }, 'Scheduled factoring check failed');
  }
}, FACTORING_INTERVAL_MS);

// Auch einmal beim Start ausführen (nach 10 Sekunden Delay)
setTimeout(async () => {
  try {
    await checkOpenFactoringDeals();
  } catch (error) {
    logger.error({ error }, 'Initial factoring check failed');
  }
}, 10000);
```

### 4. `src/routes/webhooks.ts` — Gmail-Webhook entfernen, manuellen Trigger hinzufügen

Den `POST /webhooks/gmail` Endpunkt entfernen.

Stattdessen einen manuellen Trigger-Endpunkt hinzufügen (für Tests und Ad-hoc-Checks):

```typescript
// POST /webhooks/factoring/check — Manueller Trigger für Factoring-Check
router.post('/webhooks/factoring/check', verifyWebhookSecret, async (req, res) => {
  const start = Date.now();
  try {
    const result = await checkOpenFactoringDeals();
    const duration = Date.now() - start;
    logger.info({ duration, ...result }, 'Manual factoring check completed');
    res.json({ success: true, ...result, duration_ms: duration });
  } catch (error) {
    // error handling...
  }
});
```

### 5. `src/config.ts` — Google-Credentials entfernen

```typescript
// ENTFERNEN:
google: {
  clientId: optionalEnv('GOOGLE_CLIENT_ID', ''),
  clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET', ''),
  refreshToken: optionalEnv('GOOGLE_REFRESH_TOKEN', ''),
},

// NEU hinzufügen:
factoring: {
  intervalMinutes: parseInt(optionalEnv('FACTORING_CHECK_INTERVAL_MINUTES', '30'), 10),
},
```

### 6. `src/types/webhooks.ts` — GmailPushNotification entfernen

Den `GmailPushNotification` Interface komplett entfernen.

### 7. `.env.example` — Aktualisieren

```env
# ENTFERNEN:
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx

# NEU:
FACTORING_CHECK_INTERVAL_MINUTES=30
```

### 8. Railway Env-Vars — Aufräumen

Folgende Env-Vars können auf Railway gelöscht werden:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET  
- GOOGLE_REFRESH_TOKEN

## Zusammenfassung der Änderungen

| Datei | Aktion |
|-------|--------|
| src/services/factoring.ts | Komplett umschreiben (Gmail → Pipedrive) |
| src/services/pipedrive.ts | `getOpenDeals()` Methode hinzufügen |
| src/index.ts | Cron-Job (setInterval) hinzufügen |
| src/routes/webhooks.ts | Gmail-Route entfernen, `/factoring/check` hinzufügen |
| src/config.ts | Google-Config entfernen, Factoring-Interval hinzufügen |
| src/types/webhooks.ts | GmailPushNotification entfernen |
| .env.example | Google-Vars entfernen, FACTORING_CHECK_INTERVAL_MINUTES hinzufügen |

## Wichtig

- Der E-Mail-Parser (parseFactoringDecision) bleibt gleich — 6 Positiv- und 6 Negativ-Muster
- Deals ohne aifinyo-Mail werden übersprungen (nicht als Fehler behandelt)
- Jeder Deal wird einzeln in try/catch gewrapped — ein fehlerhafter Deal stoppt nicht den Rest
- Der Check filtert nur Deals wo das Factoring-Feld LEER ist — bereits beantwortete werden übersprungen
- Auch bei Rahmenvertrag-Deals ist das Factoring-Feld leer, aber die kommen nie in die Prüfung weil sie nie eine aifinyo-Anfrage bekommen haben (kein Eintrag im Data Store im alten System)
