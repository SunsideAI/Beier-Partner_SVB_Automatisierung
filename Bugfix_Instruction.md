# Bugfix Instruction — Automation API

## Kontext

Code Review der Automation API hat 8 Issues identifiziert. Diese Instruction beschreibt jeden Fix mit exaktem Datei-Bezug, dem Problem und der Lösung.

---

## KRITISCH — Vor Deployment fixen

### Bug 1: Keine Webhook-Authentifizierung

**Datei:** `src/routes/leads.ts`, `src/routes/webhooks.ts`
**Problem:** Kein Endpunkt prüft den `x-webhook-secret` Header. Jeder kann die API aufrufen.

**Fix:**

1. Neue Datei `src/middleware/auth.ts` erstellen:

```typescript
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
```

2. In `src/routes/leads.ts` — Middleware einbinden:

```typescript
import { verifyWebhookSecret } from '../middleware/auth';

// Alle Lead-Routen absichern
router.post('/leads/form', verifyWebhookSecret, (req, res) => handleLead(req, res, 'form'));
router.post('/leads/chatbot', verifyWebhookSecret, (req, res) => handleLead(req, res, 'chatbot'));
router.post('/leads/voicebot', verifyWebhookSecret, (req, res) => handleLead(req, res, 'voicebot'));
```

3. In `src/routes/webhooks.ts` — Middleware einbinden:

```typescript
import { verifyWebhookSecret, verifyPandaDocSignature } from '../middleware/auth';

router.post('/webhooks/pandadoc', verifyPandaDocSignature, async (req, res) => { ... });
router.post('/webhooks/gmail', verifyWebhookSecret, async (req, res) => { ... });
router.post('/webhooks/pipedrive/termin', verifyWebhookSecret, async (req, res) => { ... });
router.post('/webhooks/pipedrive/deal', verifyWebhookSecret, async (req, res) => { ... });
```

---

### Bug 2: Geocoding-Ergebnis wird weggeworfen

**Datei:** `src/services/crm.ts`
**Problem:** `geocodeAddress()` wird aufgerufen, aber der Rückgabewert (Koordinaten) wird nicht gespeichert. Die Objektadresse wird nicht geokodiert in Pipedrive hinterlegt.

**Fix:** In `src/services/crm.ts` — Geocoding-Ergebnis in Lead-Daten übernehmen:

```typescript
// VORHER (Zeile ~41):
if (object_address) {
  await geocodeAddress(object_address);
}

// NACHHER:
let geocodedAddress: string | undefined;
if (object_address) {
  const geo = await geocodeAddress(object_address);
  if (geo) {
    geocodedAddress = geo.label; // Formatierte Adresse von PositionStack
  }
}
```

Dann beim Lead erstellen die Objektadresse setzen:

```typescript
// Lead-Daten ergänzen:
if (object_address) {
  (leadData as any)[PD_FIELDS.OBJEKTADRESSE] = geocodedAddress || object_address;
}
```

Und in der Note auch die Geokodierung vermerken:

```typescript
const noteContent = [
  `Quelle: ${source}`,
  interest ? `Interesse an: ${interest}` : null,
  message ? `Nachricht: ${message}` : null,
  address ? `Kundenadresse: ${address}` : null,
  object_address ? `Objektadresse: ${object_address}` : null,
  geocodedAddress && geocodedAddress !== object_address
    ? `Geokodiert: ${geocodedAddress}`
    : null,
]
  .filter(Boolean)
  .join('\n');
```

---

### Bug 3: Anrede wird als `label` statt Custom Field gespeichert

**Datei:** `src/services/crm.ts`
**Problem:** Anrede wird als `label` (= farbiger Tag in Pipedrive) gesetzt. Im Original-Blueprint war es ein eigenes Custom Field am Person-Objekt.

**Fix:**

1. Anrede Custom-Field-ID aus Pipedrive auslesen. Dazu diesen curl-Befehl ausführen:

```bash
curl "https://beierundpartner.pipedrive.com/api/v1/personFields?api_token=968aec2271b970e20e58c818f4b8b64ec0330a1c" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for field in data.get('data', []):
    if 'anrede' in field.get('name', '').lower() or 'anrede' in field.get('key', '').lower():
        print(f'Name: {field[\"name\"]}, Key: {field[\"key\"]}, ID: {field[\"id\"]}')
"
```

2. In `src/config.ts` — neues Feld hinzufügen:

```typescript
export const PD_FIELDS = {
  // ... bestehende Felder ...

  // Person-Felder
  ANREDE: 'HIER_DIE_FIELD_ID_EINTRAGEN',  // ← aus curl-Ergebnis
} as const;
```

3. In `src/services/crm.ts` — Anrede als Custom Field setzen:

```typescript
// VORHER:
const person = await pipedrive.createPerson({
  name,
  email: [{ value: email, primary: true }],
  phone: phone ? [{ value: phone, primary: true }] : undefined,
  owner_id: config.defaultOwnerId,
  label: anrede,  // ← FALSCH: label ist ein farbiger Tag
});

// NACHHER:
const person = await pipedrive.createPerson({
  name,
  email: [{ value: email, primary: true }],
  phone: phone ? [{ value: phone, primary: true }] : undefined,
  owner_id: config.defaultOwnerId,
});

// Anrede als Custom Field per separatem Update setzen
await pipedrive.updatePerson(person.id, {
  [PD_FIELDS.ANREDE]: anrede,
} as any);
```

---

### Bug 4: Rahmenvertrag-Feldwert — String oder Option-ID?

**Datei:** `src/services/contracts.ts`, `src/services/crm.ts`
**Problem:** Der Code prüft `rahmenvertrag === 'Ja'`, aber Pipedrive Select-Felder geben je nach Kontext die Option-ID (Zahl) oder das Label (String) zurück. Im Blueprint stand `.label` — das deutet darauf hin, dass der Raw-Wert eine ID ist.

**Fix:**

1. Erst verifizieren was die API tatsächlich zurückgibt:

```bash
# Einen bestehenden Deal mit Rahmenvertrag abrufen und prüfen:
curl "https://beierundpartner.pipedrive.com/api/v1/deals?api_token=968aec2271b970e20e58c818f4b8b64ec0330a1c&limit=5" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for deal in data.get('data', []) or []:
    rv = deal.get('9ed429fe5471134bc5d3c881bac3cb2863f25e0b')
    print(f'Deal {deal[\"id\"]}: Rahmenvertrag raw value = {rv} (type: {type(rv).__name__})')
"
```

2. Falls der Wert eine Zahl (Option-ID) ist, müssen die Option-IDs ermittelt werden:

```bash
curl "https://beierundpartner.pipedrive.com/api/v1/dealFields?api_token=968aec2271b970e20e58c818f4b8b64ec0330a1c" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for field in data.get('data', []):
    if field.get('key') == '9ed429fe5471134bc5d3c881bac3cb2863f25e0b':
        print(f'Rahmenvertrag options:')
        for opt in field.get('options', []):
            print(f'  ID: {opt[\"id\"]}, Label: {opt[\"label\"]}')
    if field.get('key') == 'ddf37ced62736231377faadda44665744884ff7a':
        print(f'Sonderbedingung options:')
        for opt in field.get('options', []):
            print(f'  ID: {opt[\"id\"]}, Label: {opt[\"label\"]}')
"
```

3. In `src/config.ts` — Option-IDs ergänzen (Beispielwerte, müssen durch echte Werte ersetzt werden):

```typescript
export const PD_FIELDS = {
  // ... bestehende Felder ...

  // Rahmenvertrag Select-Optionen
  RAHMENVERTRAG_JA: 'OPTION_ID_JA',   // ← aus curl-Ergebnis
  RAHMENVERTRAG_NEIN: 'OPTION_ID_NEIN',

  // Sonderbedingung Select-Optionen
  SONDERBEDINGUNG_JA: 'OPTION_ID_JA',
  SONDERBEDINGUNG_NEIN: 'OPTION_ID_NEIN',
} as const;
```

4. In `src/services/contracts.ts` — Vergleich anpassen:

```typescript
// VORHER:
if (rahmenvertrag === 'Ja' || sonderbedingung === 'Ja') { ... }

// NACHHER (falls Option-IDs):
const isRahmenvertrag = String(rahmenvertrag) === String(PD_FIELDS.RAHMENVERTRAG_JA);
const isSonderbedingung = String(sonderbedingung) === String(PD_FIELDS.SONDERBEDINGUNG_JA);
if (isRahmenvertrag || isSonderbedingung) { ... }
```

Gleiches in `processNewDealTax()` anpassen.

---

## WICHTIG — Zeitnah beheben

### Bug 5: Keine Team-Benachrichtigung bei unklarem Factoring

**Datei:** `src/services/factoring.ts`
**Problem:** Bei Status „unklar" wird nur ein `logger.warn` geschrieben. Niemand sieht das aktiv.

**Fix:** Pipedrive-Aktivität als Benachrichtigung anlegen:

```typescript
// In processGmailNotification(), im else-Block für "unklar":

} else {
  // Status "unklar" — Aktivität in Pipedrive für manuelle Prüfung anlegen
  logger.warn(
    { dealId, status, subject, snippet: message.snippet },
    'Factoring status unclear — manual review required',
  );

  await pipedrive.createActivity({
    subject: `⚠️ Factoring unklar — manuelle Prüfung nötig`,
    type: 'task',
    due_date: new Date().toISOString().split('T')[0],
    deal_id: dealId,
    note: `Eine aifinyo-E-Mail konnte nicht eindeutig zugeordnet werden.\n\nBetreff: ${subject}\nVorschau: ${message.snippet}\n\nBitte E-Mail manuell prüfen und Factoring-Status setzen.`,
  });
}
```

---

### Bug 6: PDF-Split ohne Fehlerbehandlung

**Datei:** `src/utils/pdf.ts`
**Problem:** Kein Check für einseitige PDFs oder ungültige Dateien.

**Fix:**

```typescript
import { PDFDocument } from 'pdf-lib';
import logger from './logger';

export async function extractFirstPage(pdfBuffer: Buffer): Promise<Buffer> {
  let srcDoc: PDFDocument;

  try {
    srcDoc = await PDFDocument.load(pdfBuffer);
  } catch (error) {
    logger.error({ error }, 'Failed to load PDF for Vollmacht split');
    throw new Error('Invalid PDF file — cannot extract Vollmacht');
  }

  const pageCount = srcDoc.getPageCount();
  if (pageCount < 2) {
    logger.warn({ pageCount }, 'PDF has fewer than 2 pages, cannot split Vollmacht');
    throw new Error(`PDF has only ${pageCount} page(s) — need at least 2 for Vollmacht split`);
  }

  const newDoc = await PDFDocument.create();
  const [copiedPage] = await newDoc.copyPages(srcDoc, [0]);
  newDoc.addPage(copiedPage);

  const pdfBytes = await newDoc.save();
  return Buffer.from(pdfBytes);
}
```

---

### Bug 7: `ts-node` fehlt in devDependencies

**Datei:** `package.json`
**Problem:** `npm run dev` funktioniert nicht, weil `ts-node` nicht installiert ist.

**Fix:**

```bash
npm install -D ts-node
```

Oder in `package.json` unter `devDependencies` ergänzen:

```json
"devDependencies": {
  "@types/express": "^5.0.0",
  "@types/node": "^22.0.0",
  "ts-node": "^10.9.0",
  "typescript": "^5.6.0"
}
```

---

## MINOR

### Bug 8: Sachverständigenvertrag-Suche Umlaut-Fallback

**Datei:** `src/services/contracts.ts`
**Problem:** Suche nach `sachverständigenvertrag` greift nicht wenn Dateiname ohne Umlaute geschrieben ist.

**Fix:**

```typescript
// VORHER:
const svFile = files.find((f) =>
  f.name.toLowerCase().includes('sachverständigenvertrag') ||
  f.file_name.toLowerCase().includes('sachverständigenvertrag'),
);

// NACHHER:
const svFile = files.find((f) => {
  const name = f.name.toLowerCase();
  const fileName = f.file_name.toLowerCase();
  return (
    name.includes('sachverständigenvertrag') ||
    name.includes('sachverstaendigenvertrag') ||
    name.includes('sv-vertrag') ||
    fileName.includes('sachverständigenvertrag') ||
    fileName.includes('sachverstaendigenvertrag') ||
    fileName.includes('sv-vertrag')
  );
});
```

---

## Reihenfolge der Fixes

```
1. Bug 1 — Webhook-Auth (Middleware erstellen + einbinden)
2. Bug 4 — Rahmenvertrag-Feldwerte verifizieren (curl ausführen!)
3. Bug 3 — Anrede Custom-Field-ID ermitteln (curl ausführen!)
4. Bug 2 — Geocoding-Ergebnis speichern
5. Bug 6 — PDF-Fehlerbehandlung
6. Bug 5 — Factoring-Benachrichtigung
7. Bug 7 — ts-node installieren
8. Bug 8 — Umlaut-Fallback
```

**Hinweis:** Bug 3 und 4 erfordern jeweils einen curl-Befehl gegen die Pipedrive API, um die richtigen Field-IDs/Option-IDs zu ermitteln. Diese Werte müssen vor dem Fix bekannt sein.
