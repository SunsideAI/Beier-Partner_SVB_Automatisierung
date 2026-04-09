function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),

  pipedrive: {
    apiToken: requireEnv('PIPEDRIVE_API_TOKEN'),
    companyDomain: optionalEnv('PIPEDRIVE_COMPANY_DOMAIN', 'beierundpartner'),
  },

  genderApi: {
    key: requireEnv('GENDER_API_KEY'),
  },

  positionStack: {
    key: requireEnv('POSITIONSTACK_API_KEY'),
  },

  pandadoc: {
    webhookSecret: optionalEnv('PANDADOC_WEBHOOK_SECRET', ''),
  },

  google: {
    clientId: optionalEnv('GOOGLE_CLIENT_ID', ''),
    clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET', ''),
    refreshToken: optionalEnv('GOOGLE_REFRESH_TOKEN', ''),
  },

  webhookSecret: optionalEnv('WEBHOOK_SECRET', ''),

  resend: {
    apiKey: optionalEnv('RESEND_API_KEY', ''),
    alertEmailTo: optionalEnv('ALERT_EMAIL_TO', 'contact@sunsideai.de'),
    alertEmailFrom: optionalEnv('ALERT_EMAIL_FROM', 'alerts@sunsideai.de'),
  },

  defaultOwnerId: parseInt(optionalEnv('DEFAULT_OWNER_ID', '22587384'), 10),
} as const;

/** Pipedrive Custom Field IDs — konfigurierbar per ENV fuer Sandbox/Produktion */
export const PD_FIELDS = {
  // Deal-Felder
  RAHMENVERTRAG: optionalEnv('PD_RAHMENVERTRAG', '9ed429fe5471134bc5d3c881bac3cb2863f25e0b'),
  GERICHTSAUFTRAG: optionalEnv('PD_GERICHTSAUFTRAG', 'ddf37ced62736231377faadda44665744884ff7a'),
  FACTORING: optionalEnv('PD_FACTORING', '83bb2cb93a7f9879b50188fb1c1f09e2e8260db3'),
  OBJEKTADRESSE: optionalEnv('PD_OBJEKTADRESSE', '6725f53779d3dcf7e0663e3547eea448a0c70f9d'),
  KUNDENADRESSE: optionalEnv('PD_KUNDENADRESSE', '2f61955f14617f9063b8e45c6adeeb1d7d6a5071'),
  DEALWERT_BRUTTO: optionalEnv('PD_DEALWERT_BRUTTO', '3177b6ce8c67fd68222ed05c5fb14413e4eda04b'),
  EIGENTUEMER: optionalEnv('PD_EIGENTUEMER', '4f5db71f6d5ce4045fdbcf2fa020753bd245d2b7'),
  OBJEKTART: optionalEnv('PD_OBJEKTART', 'e5802685d051d8f198faee5faa1b9d038a41b162'),
  BEWERTUNGSPRODUKT: optionalEnv('PD_BEWERTUNGSPRODUKT', 'f63cfd17f9ca4d7622dab1693809f94e24675a1a'),
  GRUND_WERTERMITTLUNG: optionalEnv('PD_GRUND_WERTERMITTLUNG', 'ebc333e5643750932744438376de8e53f1325042'),
  WERTERMITTLUNGSSTICHTAG: optionalEnv('PD_WERTERMITTLUNGSSTICHTAG', '20e4d06e88d56ad1cf696f49de0c17954048243c'),
  STANDORTANALYSE: optionalEnv('PD_STANDORTANALYSE', '6d75642d11a70f89cc5f359f1bc8c0ffd40d0ccc'),
  FLUR: optionalEnv('PD_FLUR', '457ef6555dc2078e1b488c6e5778dfae086c91ba'),
  FLURSTUECK: optionalEnv('PD_FLURSTUECK', '789ce96b403ed8589e01d757bd385a166d31f4c6'),
  GEMARKUNG: optionalEnv('PD_GEMARKUNG', '37f28d178c8fb98147ca4ffc6bccadc842770d6b'),
  SV: optionalEnv('PD_SV', 'f18f1653e991a65a549bf27719a07fd55241d0b5'),

  // Person-Felder
  ANREDE: optionalEnv('PD_ANREDE', '74409f5fa9bc2b9fbc32d70116ecb0949aac6955'),

  // Termin-Felder
  TERMIN_DATUM: optionalEnv('PD_TERMIN_DATUM', 'c7f123ac15cba683b62bcee0acaaf25568901ac4'),
  TERMIN_WOCHENTAG: optionalEnv('PD_TERMIN_WOCHENTAG', '20183007bd0d563913f6dd15aade0d0a10b98ec3'),
  TERMIN_UHRZEIT: optionalEnv('PD_TERMIN_UHRZEIT', 'c5f4aa03184e84873618783777a2c6efd19f9f33'),

  // Factoring-Werte (Select-Feld Optionen)
  FACTORING_JA: optionalEnv('PD_FACTORING_JA', '49'),
  FACTORING_NEIN: optionalEnv('PD_FACTORING_NEIN', '50'),

  // Rahmenvertrag Select-Optionen
  RAHMENVERTRAG_JA: optionalEnv('PD_RAHMENVERTRAG_JA', '54'),
  RAHMENVERTRAG_NEIN: optionalEnv('PD_RAHMENVERTRAG_NEIN', '55'),

  // Gerichtsauftrag Select-Optionen
  GERICHTSAUFTRAG_JA: optionalEnv('PD_GERICHTSAUFTRAG_JA', '51'),
  GERICHTSAUFTRAG_NEIN: optionalEnv('PD_GERICHTSAUFTRAG_NEIN', '52'),

  // Pipeline Stage
  STAGE_VERTRAG_UNTERSCHRIEBEN: parseInt(optionalEnv('PD_STAGE_VERTRAG_UNTERSCHRIEBEN', '11'), 10),
};
