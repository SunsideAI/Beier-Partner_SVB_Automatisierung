# Automation API — Claude Code Spec

## Projektziel

Baue eine Node.js/Express API-App (Deployment auf Railway), die alle Geschäftsprozess-Automatisierungen des Sachverständigenbüros Beier und Partner in einem einzigen Service bündelt. Die App ersetzt 9 Make.com-Workflows durch direkte API-Integrationen.

**Aktueller Zustand:** 9 Make.com-Szenarien mit API-Tokens im Klartext, Polling-Logik (8.023 Ops), deprecated Modulen und keinem Error-Handling.

**Zielzustand:** Ein Node.js-Service auf Railway mit Webhook-Endpunkten, direkten API-Calls, sauberem Error-Handling und Logging.

---

## Architektur

```
                    ┌──────────────────────────────────────────────┐
                    │           Automation API (Railway)            │
                    │           Node.js · Express · TS              │
                    ├──────────────────────────────────────────────┤
   Eingänge:        │                                              │     Ausgänge:
                    │  POST /leads/form      → CRM-Anlage          │
   Website ────────►│  POST /leads/chatbot   → CRM-Anlage          │────► Pipedrive CRM
   Voiceflow ──────►│  POST /leads/voicebot  → CRM-Anlage          │────► Google Calendar
   Retell ─────────►│                                              │
                    │  POST /webhooks/pandadoc → Vertragslogik     │
   PandaDoc ───────►│  POST /webhooks/gmail    → Factoring-Check   │
   Gmail ──────────►│  POST /webhooks/pipedrive/termin → Termin    │
   Pipedrive ──────►│  POST /webhooks/pipedrive/deal   → Data Store│
                    │                                              │
                    │  GET /health                                 │
                    └──────────────────────────────────────────────┘
```

---

## Tech Stack

* **Runtime:** Node.js 20+
* **Framework:** Express
* **Sprache:** TypeScript
* **HTTP Client:** axios (für Pipedrive API, Gender API, Geocoding)
* **PDF:** pdf-lib (für Vollmacht-Split)
* **Deployment:** Railway (Dockerfile)
* **Logging:** pino (strukturiertes JSON-Logging)

---

## Dateistruktur

```
automation-api/
├── src/
│   ├── index.ts                    # Express Server, Route-Registrierung
│   ├── config.ts                   # Env-Variablen, Konfiguration
│   ├── routes/
│   │   ├── leads.ts                # POST /leads/form, /leads/chatbot, /leads/voicebot
│   │   ├── webhooks.ts             # POST /webhooks/pandadoc, /webhooks/gmail, /webhooks/pipedrive/*
│   │   └── health.ts               # GET /health
│   ├── services/
│   │   ├── pipedrive.ts            # Pipedrive API Client (Kontakte, Leads, Deals, Aktivitäten, Dateien)
│   │   ├── crm.ts                  # Lead-Anlage-Logik (Duplikatsprüfung, Gender, Geokodierung)
│   │   ├── factoring.ts            # aifinyo E-Mail-Parsing + Deal-Update
│   │   ├── contracts.ts            # PandaDoc-Vertragslogik (Steuer, Vollmacht, Aktivität)
│   │   ├── scheduling.ts           # Termin-Erstellung + Erinnerung
│   │   ├── gender.ts               # Gender API Integration
│   │   └── geocoding.ts            # Geokodierung (Google Maps oder OpenCage)
│   ├── utils/
│   │   ├── logger.ts               # Pino Logger Setup
│   │   ├── errors.ts               # Custom Error-Klassen
│   │   └── pdf.ts                  # PDF-Split mit pdf-lib
│   └── types/
│       ├── pipedrive.ts            # Pipedrive-Typen
│       └── webhooks.ts             # Webhook-Payload-Typen
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
└── README.md
```

---

## Umgebungsvariablen (.env.example)

```env
# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Pipedrive
PIPEDRIVE_API_TOKEN=xxx
PIPEDRIVE_COMPANY_DOMAIN=beierundpartner

# Gender API
GENDER_API_KEY=xxx

# Geocoding (Google Maps oder OpenCage)
GEOCODING_API_KEY=xxx
GEOCODING_PROVIDER=google  # oder "opencage"

# PandaDoc (Webhook-Verifizierung)
PANDADOC_WEBHOOK_SECRET=xxx

# Gmail (für Factoring)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx

# Webhook-Sicherheit (einfacher API-Key für eingehende Webhooks)
WEBHOOK_SECRET=xxx

# Pipedrive Owner
DEFAULT_OWNER_ID=22587384
```

---

## Pipedrive Custom Fields (aus Blueprints extrahiert)

Diese Hash-IDs sind die internen Pipedrive-Feldnamen. Sie werden im Code als Konstanten definiert.

```typescript
// src/config.ts — Pipedrive Custom Field IDs
export const PD_FIELDS = {
  // Deal-Felder
  RAHMENVERTRAG: '9ed429fe5471134bc5d3c881bac3cb2863f25e0b',
  SONDERBEDINGUNG: 'ddf37ced62736231377faadda44665744884ff7a',
  FACTORING: '83bb2cb93a7f9879b50188fb1c1f09e2e8260db3',
  OBJEKTADRESSE: '6725f53779d3dcf7e0663e3547eea448a0c70f9d',
  KUNDENADRESSE: '2f61955f14617f9063b8e45c6adeeb1d7d6a5071',
  DEALWERT_BRUTTO: '3177b6ce8c67fd68222ed05c5fb14413e4eda04b',
  EIGENTUEMER: '4f5db71f6d5ce4045fdbcf2fa020753bd245d2b7',
  OBJEKTART: 'e5802685d051d8f198faee5faa1b9d038a41b162',
  BEWERTUNGSPRODUKT: 'f63cfd17f9ca4d7622dab1693809f94e24675a1a',
  GRUND_WERTERMITTLUNG: 'ebc333e5643750932744438376de8e53f1325042',
  WERTERMITTLUNGSSTICHTAG: '20e4d06e88d56ad1cf696f49de0c17954048243c',
  STANDORTANALYSE: '6d75642d11a70f89cc5f359f1bc8c0ffd40d0ccc',
  FLUR: '457ef6555dc2078e1b488c6e5778dfae086c91ba',
  FLURSTUECK: '789ce96b403ed8589e01d757bd385a166d31f4c6',
  GEMARKUNG: '37f28d178c8fb98147ca4ffc6bccadc842770d6b',
  SV: 'f18f1653e991a65a549bf27719a07fd55241d0b5',

  // Termin-Felder
  TERMIN_DATUM: 'c7f123ac15cba683b62bcee0acaaf25568901ac4',
  TERMIN_WOCHENTAG: '20183007bd0d563913f6dd15aade0d0a10b98ec3',
  TERMIN_UHRZEIT: 'c5f4aa03184e84873618783777a2c6efd19f9f33',

  // Factoring-Werte (Select-Feld Optionen)
  FACTORING_JA: 49,
  FACTORING_NEIN: 50,

  // Pipeline Stage
  STAGE_VERTRAG_UNTERSCHRIEBEN: 11,

  // Owner
  DEFAULT_OWNER_ID: 22587384,  // Patrick Beier
} as const;
```

---

## Modul 1: Lead-Anlage (crm.ts)

**Ersetzt:** Webhook Kontaktformular + Gender API

### Endpunkte

- `POST /leads/form` — Website-Kontaktformular
- `POST /leads/chatbot` — Voiceflow-Webhook (Payload-Format TBD)
- `POST /leads/voicebot` — Retell-Webhook (Payload-Format TBD)

### Request-Format (Kontaktformular)

```json
{
  "name": "Max Mustermann",
  "email": "max@example.de",
  "phone": "+49 123 456789",
  "address": "Musterstraße 1, 60311 Frankfurt",
  "object_address": "Bewertungsstraße 5, 65189 Wiesbaden",
  "interest": "Verkehrswertgutachten",
  "message": "Ich benötige ein Gutachten für eine Scheidung.",
  "source": "form"
}
```

### Ablauf

```
1. Webhook empfangen
2. Duplikatsprüfung: Pipedrive API → Search Persons by Email
   - Wenn Kontakt existiert → nur neuen Deal anlegen (kein neuer Kontakt)
   - Wenn Kontakt nicht existiert → weiter
3. Gender API: GET https://gender-api.com/get?name={vorname}&key={key}
   - Response: { "gender": "male"|"female"|"unknown" }
   - "male" → Anrede = "Sehr geehrter Herr"
   - "female" → Anrede = "Sehr geehrte Frau"
   - "unknown" oder Fehler → Anrede = "Guten Tag" (FALLBACK — fehlte bisher!)
4. Geokodierung (wenn object_address vorhanden):
   - Geocoding API aufrufen → Koordinaten erhalten
5. Pipedrive: Create Person
   - Name, Email, Phone, Anrede-Feld
6. Pipedrive: Create Lead
   - Titel: "Neuer Lead: {name}"
   - Owner: DEFAULT_OWNER_ID (22587384 = Patrick Beier)
   - Person: person_id aus Schritt 5
   - Kundenadresse: address
7. Pipedrive: Create Note am Lead
   - Content: "Interesse an: {interest}\nNachricht: {message}"
8. Response: { success: true, lead_id, person_id, source }
```

### Verbesserungen gegenüber Make.com

- Duplikatsprüfung (fehlte komplett)
- Gender-Fallback für unbekannte Vornamen
- Einheitlicher Endpunkt für alle Lead-Quellen
- Kanal-Tracking (source-Feld)

---

## Modul 2: Factoring (factoring.ts)

**Ersetzt:** Check aifinyo Mails + Deals im Data Storage speichern + Delete Deal from Storage

### Endpunkt

- `POST /webhooks/gmail` — Gmail Push-Notification (Google Cloud Pub/Sub)

### Aktueller Make.com-Ablauf (wird ersetzt)

```
1. Data Store: Alle offenen Deals holen (POLLING — verursacht 8.023 Ops!)
2. Für jeden Deal: HTTP GET /deals/{id}/mailMessages
3. Iterator: Jede E-Mail durchgehen
4. Iterator: Jeden Absender durchgehen
5. Router:
   - Absender enthält "aifinyo.de" UND Snippet enthält "Ja" → Factoring = 49
   - Absender enthält "aifinyo.de" UND Snippet enthält "Nein" → Factoring = 50
6. Deal aus Data Store löschen
```

### Neuer Ablauf (Event-basiert)

```
1. Gmail Push-Notification empfangen (neue E-Mail)
2. Prüfen: Ist der Absender @aifinyo.de? → Wenn nein: ignorieren
3. E-Mail-Body über Gmail API lesen
4. E-Mail-Inhalt parsen:
   - Eindeutig "Ja"/Zusage → factoring_status = "ja"
   - Eindeutig "Nein"/Absage → factoring_status = "nein"
   - Unklar → factoring_status = "unklar"
5. Deal in Pipedrive finden:
   - Option A: Betreffzeile enthält Deal-Referenz
   - Option B: E-Mail-Thread über Pipedrive mailMessages API zuordnen
6. Pipedrive: Update Deal
   - Factoring = FACTORING_JA (49) oder FACTORING_NEIN (50)
7. Wenn "unklar": Benachrichtigung ans Team (z.B. Slack oder E-Mail)
   → FALLBACK — fehlte bisher, verursachte endlose Polling-Zyklen
```

### Wichtige Verbesserungen

- Event-basiert statt Polling → von 8.023 Ops auf ~0 im Leerlauf
- Kein Data Store mehr nötig (Make.com-spezifisches Konstrukt)
- Fallback-Route für unklare Antworten
- Strukturierter E-Mail-Parser statt simpler "enthält Ja/Nein"-Prüfung

---

## Modul 3: Vertragsverwaltung (contracts.ts)

**Ersetzt:** Watch PandaDocs + Split Vertrag + Steuersatz ändern

### Endpunkte

- `POST /webhooks/pandadoc` — PandaDoc Webhook bei Statusänderung
- `POST /webhooks/pipedrive/deal` — Pipedrive Webhook bei Deal-Neuanlage (Steuersatz)

### PandaDoc-Webhook Ablauf

```
1. PandaDoc Webhook empfangen (Dokument-Status geändert)
2. Empfänger-Liste durchgehen:
   - kontakt@beierundpartner.de herausfiltern
   - Restliche E-Mails in Pipedrive suchen (Search Persons by Email)
3. Wenn kein Kontakt gefunden → LOGGEN (nicht still ignorieren wie bisher)
4. Wenn Kontakt gefunden:
   a. Pipedrive: List Deals for Person (Status: open, Limit: 1)
   b. Pipedrive: List Products in Deal
   c. Für jedes Produkt: Update Product Attachment
      - Tax: 19
      - Tax Method: TBD (klären: "inclusive" oder "exclusive")
      → WICHTIG: Im alten System inkonsistent! Muss einheitlich sein.
   d. Pipedrive: Get Activities for Deal
      - Aktivität mit Subject "Vertrag unterschrieben?" finden
      - Als "done" markieren
   e. Pipedrive: Update Deal
      - Stage = STAGE_VERTRAG_UNTERSCHRIEBEN (11)
   f. Wenn Termin-Datum vorhanden → Termin-Logik triggern (siehe Modul 4)
```

### Steuersatz bei neuem Deal (kein Rahmenvertrag)

```
1. Pipedrive Webhook empfangen (neuer Deal)
2. Pipedrive: Get Deal → Rahmenvertrag-Feld prüfen
3. Wenn Rahmenvertrag = "Nein":
   a. Pipedrive: List Products in Deal
   b. Für jedes Produkt: Update Product
      - Tax: 19
      - Tax Method: TBD (siehe oben — muss identisch sein mit PandaDoc-Logik)
```

### Vollmacht-Split (Split Vertrag)

```
1. Wird im PandaDoc-Webhook oder als separater Pipedrive-Webhook getriggert
2. Pipedrive: Get Deal → Prüfen:
   - Rahmenvertrag = "Nein" UND
   - Sonderbedingung = "Nein"
3. Pipedrive: List Deal Files
4. Datei mit Name enthält "Sachverständigenvertrag" finden
5. Pipedrive: Download File → Buffer
6. pdf-lib: Seite 1 extrahieren (= Vollmacht)
7. Pipedrive: Upload File
   - Dateiname: "Vollmacht"
   - Deal ID: deal_id
```

### Verbesserungen

- Einheitliche Tax Method (Inkonsistenz wird behoben)
- PDF-Split intern mit pdf-lib statt externer PDF.co-Service
- Kein Sleep-Modul (2 Min. warten) — Webhook-basiert
- Logging statt Platzhalter-Modul bei "kein Kontakt gefunden"

---

## Modul 4: Terminplanung (scheduling.ts)

**Ersetzt:** SV Termin vereinbaren

### Endpunkt

- `POST /webhooks/pipedrive/termin` — Pipedrive Webhook bei Deal-Update (Termin-Feld gefüllt)

### Ablauf

```
1. Pipedrive Webhook empfangen (Deal-Update mit Termin-Datum)
2. Pipedrive: Get Deal → Termin-Daten extrahieren:
   - TERMIN_DATUM (c7f123ac...)
   - TERMIN_UHRZEIT (c5f4aa03...)
   - OBJEKTADRESSE formatted_address (6725f537..._formatted_address)
   - SV (f18f1653...) → User-ID des Sachverständigen
3. Pipedrive: Create Activity
   - Subject: "Vor Ort Termin"
   - Type: "vor_ort_termin"
   - Due Date: TERMIN_DATUM (Format: YYYY-MM-DD)
   - Due Time: TERMIN_UHRZEIT
   - User ID: SV user_id
   - Deal ID: deal_id
4. Pipedrive: Update Activity
   - Location: OBJEKTADRESSE formatted_address
5. Erinnerung erstellen (2 Tage vorher):
   - Datum berechnen: TERMIN_DATUM - 2 Tage
   - Pipedrive: Create Activity
     - Subject: "Vor Ort Termin - final Check"
     - Type: "task"
     - Due Date: berechnetes Datum
     - Due Time: "09:00"
     - User ID: SV user_id
     - Deal ID: deal_id
   - Pipedrive: Update Activity (Note setzen):
     - Note: (siehe Checkliste unten)
```

### Checkliste (Note der Erinnerung)

```
In zwei Tagen steht ein Vor Ort Termin an. Bitte prüfe final, ob alle Unterlagen vorhanden sind:

-Wurde der Termin bestätigt?
-Liegt die Rückmeldung vom Factoring vor?
-Liegen alle relevanten Unterlagen vollständig vor?
-Liegt die Vollmacht vor?
-Wurden die Schlüssel organisiert?
```

### Verbesserungen

- Alle Aktivitäten über native Pipedrive API statt Legacy-HTTP-Module
- API-Token sicher in Env-Variablen
- Error-Handling bei fehlenden Termin-Feldern

---

## Pipedrive API Client (pipedrive.ts)

Zentraler API-Client, der von allen Modulen genutzt wird.

### Basis-Konfiguration

```typescript
const PIPEDRIVE_BASE = `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1`;
// Alle Requests mit api_token als Query-Parameter (NICHT in URL hardcoden!)
// Oder besser: OAuth wenn verfügbar
```

### Benötigte Methoden

```typescript
// Personen
searchPersons(email: string): Promise<Person[]>
createPerson(data: CreatePersonInput): Promise<Person>
updatePerson(id: number, data: Partial<Person>): Promise<Person>

// Leads
createLead(data: CreateLeadInput): Promise<Lead>

// Notes
createNote(leadId: string, content: string): Promise<Note>

// Deals
getDeal(id: number): Promise<Deal>
updateDeal(id: number, data: Partial<Deal>): Promise<Deal>
getDealsForPerson(personId: number, status?: string): Promise<Deal[]>
getDealMailMessages(dealId: number): Promise<MailMessage[]>

// Produkte
listProductsInDeal(dealId: number): Promise<Product[]>
updateProductInDeal(dealId: number, productAttachmentId: number, data: ProductUpdate): Promise<void>

// Aktivitäten
getActivitiesForDeal(dealId: number): Promise<Activity[]>
createActivity(data: CreateActivityInput): Promise<Activity>
updateActivity(id: number, data: Partial<Activity>): Promise<Activity>

// Dateien
listDealFiles(dealId: number): Promise<File[]>
downloadFile(fileId: number): Promise<Buffer>
uploadFile(dealId: number, fileName: string, data: Buffer): Promise<File>
```

---

## Error Handling

Jeder Webhook-Handler ist in try/catch gewrapped. Fehler werden geloggt und eine sinnvolle Response zurückgegeben.

```typescript
// Fehlerkategorien:
// 1. Validierungsfehler (400) — fehlende Pflichtfelder
// 2. Pipedrive API-Fehler (502) — API nicht erreichbar oder Rate-Limit
// 3. Interne Fehler (500) — unerwartete Exceptions

// Jeder Endpoint loggt:
// - Eingangs-Payload (ohne sensible Daten)
// - Verarbeitungszeit
// - Erfolg/Fehler mit Details
```

---

## Webhook-Sicherheit

```typescript
// Eingehende Webhooks verifizieren:
// 1. PandaDoc: Signatur-Header prüfen (PANDADOC_WEBHOOK_SECRET)
// 2. Pipedrive: Webhook-Signatur prüfen (falls verfügbar)
// 3. Voiceflow/Retell: API-Key im Header prüfen (WEBHOOK_SECRET)
// 4. Gmail: Pub/Sub Message verifizieren (Google-Signatur)
```

---

## Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Railway Setup

1. GitHub Repo → Railway verbinden
2. Build Command: `npm run build`
3. Start Command: `npm start`
4. Env Vars setzen (siehe .env.example)
5. Health Check: GET /health

---

## Vorgehen (Schritt für Schritt)

### Phase 1: Projekt-Setup

1. `npm init -y` + TypeScript-Setup
2. `npm install express axios pdf-lib pino`
3. `npm install -D typescript @types/express @types/node`
4. tsconfig.json, Dockerfile, .env.example
5. Logger-Setup (pino)

### Phase 2: Pipedrive API Client

1. `src/services/pipedrive.ts` — alle Methoden implementieren
2. Testen mit echtem API-Token gegen Pipedrive Sandbox/Test-Deals

### Phase 3: Lead-Anlage (Modul 1)

1. `src/services/crm.ts` — Lead-Logik
2. `src/services/gender.ts` — Gender API
3. `src/services/geocoding.ts` — Geokodierung
4. `src/routes/leads.ts` — Endpunkte
5. Testen: POST /leads/form mit Test-Daten

### Phase 4: Factoring (Modul 2)

1. `src/services/factoring.ts` — E-Mail-Parser
2. Gmail Push-Notification Setup (Google Cloud Console)
3. Testen: Simulierte aifinyo-E-Mail

### Phase 5: Vertragsverwaltung (Modul 3)

1. `src/services/contracts.ts` — PandaDoc-Logik + Steuer + Vollmacht
2. `src/utils/pdf.ts` — PDF-Split mit pdf-lib
3. PandaDoc Webhook konfigurieren
4. Testen: PandaDoc-Webhook simulieren

### Phase 6: Terminplanung (Modul 4)

1. `src/services/scheduling.ts` — Termin + Erinnerung
2. Pipedrive Webhook konfigurieren (Trigger bei Deal-Update)
3. Testen: Deal mit Termin-Datum updaten

### Phase 7: Integration & Deployment

1. Alle Routes zusammenführen in index.ts
2. Railway Deployment
3. Webhooks auf Railway-URL umstellen
4. Parallelbetrieb mit Make.com (2 Wochen)
5. Make.com-Szenarien deaktivieren

---

## Offene Punkte (vor Implementierung klären)

| # | Frage | Auswirkung |
|---|-------|------------|
| 1 | **Tax Method: inclusive oder exclusive?** | Betrifft contracts.ts — muss einheitlich sein |
| 2 | **Voiceflow Webhook-Payload Format** | Betrifft leads.ts — Endpunkt /leads/chatbot |
| 3 | **Retell Webhook-Payload Format** | Betrifft leads.ts — Endpunkt /leads/voicebot |
| 4 | **Gmail Push-Notification Setup** | Google Cloud Pub/Sub muss konfiguriert werden |
| 5 | **Geocoding-Provider** | Google Maps (genauer, kostet) oder OpenCage (günstiger) |
| 6 | **Pipedrive Webhook-Konfiguration** | Welche Events triggern welche Webhooks? |
