# Automation API — Testkonzept

## Übersicht

Dieses Testkonzept deckt alle Endpunkte der Automation API systematisch ab. Tests werden in drei Stufen durchgeführt:

1. **Unit-Tests** — Einzelne Funktionen isoliert testen (Vitest)
2. **Integrationstests** — Endpunkte gegen echte APIs testen (curl / Postman)
3. **End-to-End-Tests** — Komplette Workflows von Trigger bis CRM-Update

Für Integrations- und E2E-Tests wird ein **Test-Deal** in Pipedrive verwendet, der nach jedem Testlauf bereinigt wird.

---

## Voraussetzungen

```bash
# .env.test — Testumgebung
PIPEDRIVE_API_TOKEN=968aec2271b970e20e58c818f4b8b64ec0330a1c
PIPEDRIVE_COMPANY_DOMAIN=beierundpartner
GENDER_API_KEY=64da01a8ce75d727f584208ef6a93f076f1d0322a0b9016c02e418fd0ddc9481
POSITIONSTACK_API_KEY=a82615cfdede19300ce45063f5dac464
PORT=3000
WEBHOOK_SECRET=test-secret-123
```

```bash
# API-Basis-URL
BASE_URL=http://localhost:3000

# Pipedrive-Basis-URL
PD_URL=https://beierundpartner.pipedrive.com/api/v1
PD_TOKEN=968aec2271b970e20e58c818f4b8b64ec0330a1c
```

---

## Test 0: Health Check

**Zweck:** Server läuft und antwortet.

```bash
curl "$BASE_URL/health"
```

**Erwartung:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 123
}
```

**Erfolgskriterium:** HTTP 200, `status` = `"ok"`

---

## Modul 1: Lead-Anlage (CRM)

### Test 1.1: Lead über Kontaktformular (ohne Objektadresse)

**Zweck:** Kontakt + Lead werden in Pipedrive angelegt, Anrede wird gesetzt.

```bash
curl -X POST "$BASE_URL/leads/form" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "name": "Test Mustermann",
    "email": "test-automation@example.de",
    "phone": "+49 123 9999999",
    "address": "Teststraße 1, 60311 Frankfurt",
    "interest": "Verkehrswertgutachten",
    "message": "Testanfrage aus Automatisierungs-Testkonzept",
    "source": "form"
  }'
```

**Erwartung:**
```json
{
  "success": true,
  "person_id": 12345,
  "lead_id": "abc-123",
  "source": "form"
}
```

**Prüfpunkte in Pipedrive:**
- [ ] Neuer Kontakt "Test Mustermann" vorhanden
- [ ] E-Mail korrekt: test-automation@example.de
- [ ] Telefon korrekt: +49 123 9999999
- [ ] Anrede gesetzt (Gender API → "Sehr geehrter Herr" oder Fallback "Guten Tag")
- [ ] Lead erstellt mit Titel "Neuer Lead: Test Mustermann"
- [ ] Owner = Patrick Beier (ID 22587384)
- [ ] Notiz am Lead: "Interesse an: Verkehrswertgutachten\nNachricht: Testanfrage..."
- [ ] Kundenadresse-Feld befüllt

**Aufräumen:**
```bash
# Kontakt und Lead nach Test löschen
curl -X DELETE "$PD_URL/persons/{person_id}?api_token=$PD_TOKEN"
```

---

### Test 1.2: Lead über Kontaktformular (mit Objektadresse)

**Zweck:** Geokodierung wird durchgeführt, Koordinaten im Deal gespeichert.

```bash
curl -X POST "$BASE_URL/leads/form" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "name": "Lisa Testfrau",
    "email": "lisa-test@example.de",
    "phone": "+49 170 1234567",
    "address": "Kundenweg 5, 30159 Hannover",
    "object_address": "Marktstraße 10, 65183 Wiesbaden",
    "interest": "Kurzgutachten",
    "message": "Test mit Objektadresse",
    "source": "form"
  }'
```

**Prüfpunkte (zusätzlich zu Test 1.1):**
- [ ] Anrede = "Sehr geehrte Frau" (Gender API: Lisa → female)
- [ ] Objektadresse-Feld in Pipedrive befüllt
- [ ] Geokodierung erfolgreich (Koordinaten im Deal)

---

### Test 1.3: Duplikatsprüfung

**Zweck:** Gleiche E-Mail → kein neuer Kontakt, nur neuer Deal.

```bash
# Erst Test 1.1 ausführen (Kontakt anlegen)
# Dann nochmal mit gleicher E-Mail:
curl -X POST "$BASE_URL/leads/form" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "name": "Test Mustermann",
    "email": "test-automation@example.de",
    "phone": "+49 123 9999999",
    "address": "Teststraße 1, 60311 Frankfurt",
    "interest": "Zweites Gutachten",
    "message": "Duplikat-Test",
    "source": "form"
  }'
```

**Prüfpunkte:**
- [ ] Kein neuer Kontakt angelegt (gleiche person_id wie Test 1.1)
- [ ] Neuer Lead angelegt (andere lead_id)
- [ ] Nur 1x "Test Mustermann" in Pipedrive vorhanden

---

### Test 1.4: Fehlende Pflichtfelder

**Zweck:** Validierung greift bei unvollständigen Daten.

```bash
curl -X POST "$BASE_URL/leads/form" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "name": "",
    "email": ""
  }'
```

**Erwartung:** HTTP 400
```json
{
  "success": false,
  "error": "Pflichtfelder fehlen: name, email"
}
```

---

### Test 1.5: Ungültiger Webhook-Secret

**Zweck:** Unautorisierte Requests werden abgelehnt.

```bash
curl -X POST "$BASE_URL/leads/form" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: falscher-key" \
  -d '{"name": "Hacker", "email": "hack@evil.com"}'
```

**Erwartung:** HTTP 401
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

---

### Test 1.6: Gender API Fallback

**Zweck:** Unbekannter Vorname → neutrale Anrede.

```bash
curl -X POST "$BASE_URL/leads/form" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "name": "Xyrquutz Testperson",
    "email": "unbekannt-gender@example.de",
    "phone": "+49 170 0000000",
    "interest": "Test",
    "message": "Gender-Fallback-Test",
    "source": "form"
  }'
```

**Prüfpunkte:**
- [ ] Anrede = "Guten Tag" (Fallback, da "Xyrquutz" nicht erkannt wird)

---

## Modul 2: Factoring (aifinyo)

### Test 2.1: aifinyo-Zusage erkennen

**Zweck:** E-Mail von aifinyo mit Zusage → Factoring-Feld auf "Ja" (49).

**Vorbereitung:** Test-Deal in Pipedrive anlegen mit Rahmenvertrag = Nein.

```bash
# Test-Deal anlegen
curl -X POST "$PD_URL/deals?api_token=$PD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "TESTDEAL Factoring Ja",
    "9ed429fe5471134bc5d3c881bac3cb2863f25e0b": "50"
  }'
# → deal_id merken
```

```bash
# Simulierte Gmail Push-Notification
curl -X POST "$BASE_URL/webhooks/gmail" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "message": {
      "data": "<base64-encoded-notification>"
    }
  }'
```

> **Hinweis:** Dieser Test erfordert eine echte Gmail Push-Notification oder einen Mock. Alternativ kann die interne Funktion `processAifinyoEmail()` direkt per Unit-Test aufgerufen werden.

**Unit-Test Alternative:**
```typescript
// test/factoring.test.ts
describe('Factoring E-Mail Parser', () => {
  it('erkennt aifinyo-Zusage', async () => {
    const result = parseAifinyoEmail({
      from: 'service@aifinyo.de',
      subject: 'Re: Factoring-Anfrage Deal 12345',
      body: 'Sehr geehrte Damen und Herren, wir freuen uns Ihnen mitteilen zu können, dass wir die Factoring-Anfrage positiv beschieden haben. Ja, wir übernehmen die Rechnung.'
    });
    expect(result.status).toBe('ja');
  });

  it('erkennt aifinyo-Absage', async () => {
    const result = parseAifinyoEmail({
      from: 'service@aifinyo.de',
      subject: 'Re: Factoring-Anfrage Deal 12345',
      body: 'Leider müssen wir Ihnen mitteilen, dass wir die Anfrage ablehnen. Nein, eine Übernahme ist nicht möglich.'
    });
    expect(result.status).toBe('nein');
  });

  it('erkennt unklare Antwort', async () => {
    const result = parseAifinyoEmail({
      from: 'service@aifinyo.de',
      subject: 'Re: Factoring-Anfrage',
      body: 'Wir benötigen weitere Unterlagen zur Prüfung.'
    });
    expect(result.status).toBe('unklar');
  });

  it('ignoriert Nicht-aifinyo-Mails', async () => {
    const result = parseAifinyoEmail({
      from: 'newsletter@random.de',
      subject: 'Angebot',
      body: 'Ja, wir haben tolle Angebote!'
    });
    expect(result).toBeNull();
  });
});
```

**Prüfpunkte (bei erfolgreichem Test):**
- [ ] Deal-Feld "Factoring" = 49 (Ja)
- [ ] Bei "Nein": Deal-Feld "Factoring" = 50 (Nein)
- [ ] Bei "unklar": Team-Benachrichtigung ausgelöst, Deal unverändert

---

## Modul 3: Vertragsverwaltung (PandaDoc)

### Test 3.1: PandaDoc-Webhook — Vertrag unterschrieben

**Zweck:** Steuer wird gesetzt, Aktivität erledigt, Stage aktualisiert, Vollmacht gesplittet.

**Vorbereitung:**
```bash
# Test-Deal mit Produkt anlegen
curl -X POST "$PD_URL/deals?api_token=$PD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "TESTDEAL Vertrag"}'
# → deal_id merken

# Test-Produkt an Deal hängen (manuell in Pipedrive oder per API)

# Test-Aktivität "Vertrag unterschrieben?" anlegen
curl -X POST "$PD_URL/activities?api_token=$PD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Vertrag unterschrieben?",
    "type": "task",
    "deal_id": DEAL_ID,
    "done": 0
  }'
```

```bash
# Simulierter PandaDoc-Webhook
curl -X POST "$BASE_URL/webhooks/pandadoc" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "document_state_changed",
    "data": {
      "id": "test-doc-id",
      "status": "document.completed",
      "recipients": [
        {"email": "kunde@example.de"},
        {"email": "kontakt@beierundpartner.de"}
      ]
    }
  }'
```

**Prüfpunkte:**
- [ ] kontakt@beierundpartner.de wurde herausgefiltert (nicht als Kontakt gesucht)
- [ ] Kontakt "kunde@example.de" in Pipedrive gefunden
- [ ] Alle Produkte im Deal: Tax = 19, Tax Method = inclusive
- [ ] Aktivität "Vertrag unterschrieben?" = done
- [ ] Deal Stage = 11 (STAGE_VERTRAG_UNTERSCHRIEBEN)

---

### Test 3.2: Steuersatz bei neuem Deal (kein Rahmenvertrag)

**Zweck:** Neuer Deal ohne Rahmenvertrag → alle Produkte auf 19% inclusive.

```bash
# Simulierter Pipedrive-Webhook bei Deal-Neuanlage
curl -X POST "$BASE_URL/webhooks/pipedrive/deal" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "meta": {
      "action": "added",
      "object": "deal"
    },
    "current": {
      "id": DEAL_ID,
      "9ed429fe5471134bc5d3c881bac3cb2863f25e0b": "Nein"
    }
  }'
```

**Prüfpunkte:**
- [ ] Nur Deals mit Rahmenvertrag = "Nein" werden verarbeitet
- [ ] Alle Produkte: Tax = 19, Tax Method = inclusive
- [ ] Deals mit Rahmenvertrag = "Ja" werden ignoriert

---

### Test 3.3: Steuersatz bei Rahmenvertrag (Negativtest)

```bash
curl -X POST "$BASE_URL/webhooks/pipedrive/deal" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "meta": { "action": "added", "object": "deal" },
    "current": {
      "id": DEAL_ID,
      "9ed429fe5471134bc5d3c881bac3cb2863f25e0b": "Ja"
    }
  }'
```

**Erwartung:** HTTP 200 aber keine Änderung an Produkten (Rahmenvertrag = Ja → Skip)

---

### Test 3.4: Vollmacht-Split

**Zweck:** PDF mit Name "Sachverständigenvertrag" → Seite 1 wird als "Vollmacht" hochgeladen.

**Vorbereitung:** Test-PDF "Sachverständigenvertrag.pdf" (mind. 2 Seiten) an Test-Deal anhängen.

**Unit-Test:**
```typescript
// test/pdf.test.ts
describe('PDF Split', () => {
  it('extrahiert Seite 1 als Vollmacht', async () => {
    const testPdf = fs.readFileSync('test/fixtures/test-vertrag.pdf');
    const result = await splitFirstPage(testPdf);
    
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(testPdf.length);
  });

  it('lehnt einseitige PDFs ab', async () => {
    const onePager = fs.readFileSync('test/fixtures/one-page.pdf');
    await expect(splitFirstPage(onePager)).rejects.toThrow();
  });
});
```

**Prüfpunkte (Integrationstest):**
- [ ] Nur Dateien mit "Sachverständigenvertrag" im Namen werden verarbeitet
- [ ] Nur bei Rahmenvertrag = "Nein" UND Sonderbedingung = "Nein"
- [ ] Neue Datei "Vollmacht" am Deal vorhanden
- [ ] Vollmacht enthält nur Seite 1

---

## Modul 4: Terminplanung

### Test 4.1: Vor-Ort-Termin erstellen

**Zweck:** Deal-Update mit Termin → Aktivität + Erinnerung werden erstellt.

**Vorbereitung:**
```bash
# Test-Deal mit Termin-Daten
curl -X PUT "$PD_URL/deals/DEAL_ID?api_token=$PD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "c7f123ac15cba683b62bcee0acaaf25568901ac4": "2026-05-15",
    "c5f4aa03184e84873618783777a2c6efd19f9f33": "10:00",
    "6725f53779d3dcf7e0663e3547eea448a0c70f9d_formatted_address": "Marktstraße 10, 65183 Wiesbaden"
  }'
```

```bash
# Simulierter Pipedrive-Webhook
curl -X POST "$BASE_URL/webhooks/pipedrive/termin" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "meta": {
      "action": "updated",
      "object": "deal"
    },
    "current": {
      "id": DEAL_ID
    }
  }'
```

**Prüfpunkte:**
- [ ] Aktivität "Vor Ort Termin" erstellt
- [ ] Type = "vor_ort_termin"
- [ ] Due Date = 2026-05-15
- [ ] Due Time = 10:00
- [ ] Location = "Marktstraße 10, 65183 Wiesbaden"
- [ ] User ID = SV des Deals

---

### Test 4.2: Erinnerung 2 Tage vorher

**Prüfpunkte (zusätzlich zu Test 4.1):**
- [ ] Zweite Aktivität "Vor Ort Termin - final Check" erstellt
- [ ] Type = "task"
- [ ] Due Date = 2026-05-13 (2 Tage vor Termin)
- [ ] Due Time = 09:00
- [ ] Note enthält Checkliste:
  - [ ] "Wurde der Termin bestätigt?"
  - [ ] "Liegt die Rückmeldung vom Factoring vor?"
  - [ ] "Liegen alle relevanten Unterlagen vollständig vor?"
  - [ ] "Liegt die Vollmacht vor?"
  - [ ] "Wurden die Schlüssel organisiert?"

---

### Test 4.3: Termin ohne Datum (Negativtest)

```bash
curl -X POST "$BASE_URL/webhooks/pipedrive/termin" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret-123" \
  -d '{
    "meta": { "action": "updated", "object": "deal" },
    "current": { "id": DEAL_ID }
  }'
```

**Erwartung:** Kein Termin erstellt wenn Termin-Datum leer. Error geloggt.

---

## Unit-Tests (Vitest)

### Testdateien

```
test/
├── services/
│   ├── crm.test.ts              # Lead-Anlage Logik
│   ├── factoring.test.ts        # E-Mail-Parser
│   ├── contracts.test.ts        # Steuer-Logik, Filter
│   ├── scheduling.test.ts       # Datums-Berechnung
│   ├── gender.test.ts           # Gender API + Fallback
│   └── geocoding.test.ts        # PositionStack
├── utils/
│   ├── pdf.test.ts              # PDF-Split
│   └── errors.test.ts           # Error-Handling
├── routes/
│   ├── leads.test.ts            # Endpunkt-Validierung
│   └── webhooks.test.ts         # Webhook-Authentifizierung
└── fixtures/
    ├── test-vertrag.pdf          # 3-seitiges Test-PDF
    ├── one-page.pdf              # 1-seitiges PDF (Edge Case)
    ├── aifinyo-ja.json           # Simulierte Zusage-Mail
    ├── aifinyo-nein.json         # Simulierte Absage-Mail
    ├── aifinyo-unklar.json       # Simulierte unklare Mail
    └── pandadoc-completed.json   # Simulierter PandaDoc-Webhook
```

### Wichtige Unit-Tests

```typescript
// test/services/crm.test.ts
describe('CRM Service', () => {
  describe('Anrede-Logik', () => {
    it('setzt "Sehr geehrter Herr" für männliche Vornamen', ...);
    it('setzt "Sehr geehrte Frau" für weibliche Vornamen', ...);
    it('setzt "Guten Tag" als Fallback', ...);
  });
  
  describe('Duplikatsprüfung', () => {
    it('findet bestehenden Kontakt per E-Mail', ...);
    it('erstellt neuen Kontakt wenn nicht gefunden', ...);
    it('erstellt nur neuen Deal bei bestehendem Kontakt', ...);
  });

  describe('Lead-Titel', () => {
    it('formatiert Titel als "Neuer Lead: {name}"', ...);
  });
});

// test/services/contracts.test.ts
describe('Contract Service', () => {
  describe('E-Mail-Filter', () => {
    it('filtert kontakt@beierundpartner.de heraus', ...);
    it('lässt Kunden-E-Mails durch', ...);
  });

  describe('Rahmenvertrag-Filter', () => {
    it('verarbeitet nur Deals mit Rahmenvertrag = Nein', ...);
    it('prüft Sonderbedingung = Nein für Split', ...);
  });

  describe('Dateiname-Filter', () => {
    it('erkennt "Sachverständigenvertrag" im Dateinamen', ...);
    it('ignoriert andere Dateien', ...);
    it('erkennt auch "Sachverstaendigenvertrag" (ohne Umlaut)', ...);
  });
});

// test/services/scheduling.test.ts
describe('Scheduling Service', () => {
  describe('Erinnerungsdatum', () => {
    it('berechnet 2 Tage vor dem Termin', () => {
      const terminDate = new Date('2026-05-15');
      const reminder = calculateReminderDate(terminDate);
      expect(reminder.toISOString().split('T')[0]).toBe('2026-05-13');
    });

    it('funktioniert über Monatsgrenzen', () => {
      const terminDate = new Date('2026-06-01');
      const reminder = calculateReminderDate(terminDate);
      expect(reminder.toISOString().split('T')[0]).toBe('2026-05-30');
    });

    it('funktioniert am Jahreswechsel', () => {
      const terminDate = new Date('2027-01-02');
      const reminder = calculateReminderDate(terminDate);
      expect(reminder.toISOString().split('T')[0]).toBe('2026-12-31');
    });
  });

  describe('Checkliste', () => {
    it('enthält alle 5 Prüfpunkte', ...);
  });
});
```

---

## Testablauf — Reihenfolge

```
Phase 1: Grundlagen
  ✅ Health Check (Test 0)
  ✅ Webhook-Authentifizierung (Test 1.5)
  ✅ Validierung (Test 1.4)

Phase 2: Lead-Anlage
  ✅ Formular ohne Adresse (Test 1.1)
  ✅ Formular mit Adresse (Test 1.2)
  ✅ Duplikatsprüfung (Test 1.3)
  ✅ Gender-Fallback (Test 1.6)

Phase 3: Factoring
  ✅ E-Mail-Parser Unit-Tests (Test 2.1)

Phase 4: Vertragsverwaltung
  ✅ Steuersatz bei neuem Deal (Test 3.2)
  ✅ Rahmenvertrag-Negativtest (Test 3.3)
  ✅ PandaDoc-Webhook (Test 3.1)
  ✅ Vollmacht-Split (Test 3.4)

Phase 5: Terminplanung
  ✅ Termin erstellen (Test 4.1)
  ✅ Erinnerung prüfen (Test 4.2)
  ✅ Negativtest ohne Datum (Test 4.3)
```

---

## Aufräumen nach Tests

```bash
# Alle Test-Kontakte löschen (Suche nach "test-automation" oder "TESTDEAL")
curl "$PD_URL/persons/search?term=test-automation&api_token=$PD_TOKEN"
# → IDs sammeln und löschen

curl "$PD_URL/deals/search?term=TESTDEAL&api_token=$PD_TOKEN"
# → IDs sammeln und löschen
```

Alternativ: Test-Kontakte und -Deals mit einem Prefix wie `[TEST]` oder `TESTDEAL` benennen und per Script bereinigen.

---

## Testabdeckung — Checkliste

| Modul | Test | Unit | Integration | Status |
|-------|------|:----:|:-----------:|:------:|
| Health | Server antwortet | — | Test 0 | ⬜ |
| Auth | Ungültiger Key → 401 | — | Test 1.5 | ⬜ |
| Auth | Fehlende Felder → 400 | — | Test 1.4 | ⬜ |
| CRM | Lead ohne Adresse | ⬜ | Test 1.1 | ⬜ |
| CRM | Lead mit Geokodierung | ⬜ | Test 1.2 | ⬜ |
| CRM | Duplikatsprüfung | ⬜ | Test 1.3 | ⬜ |
| CRM | Gender Fallback | ⬜ | Test 1.6 | ⬜ |
| Factoring | Zusage erkennen | ⬜ | — | ⬜ |
| Factoring | Absage erkennen | ⬜ | — | ⬜ |
| Factoring | Unklare Mail | ⬜ | — | ⬜ |
| Factoring | Nicht-aifinyo ignorieren | ⬜ | — | ⬜ |
| Vertrag | Steuer setzen (kein RV) | ⬜ | Test 3.2 | ⬜ |
| Vertrag | Rahmenvertrag ignorieren | ⬜ | Test 3.3 | ⬜ |
| Vertrag | PandaDoc-Webhook | ⬜ | Test 3.1 | ⬜ |
| Vertrag | Vollmacht-Split | ⬜ | Test 3.4 | ⬜ |
| Termin | Termin erstellen | ⬜ | Test 4.1 | ⬜ |
| Termin | Erinnerung 2 Tage vorher | ⬜ | Test 4.2 | ⬜ |
| Termin | Kein Datum → kein Termin | ⬜ | Test 4.3 | ⬜ |
