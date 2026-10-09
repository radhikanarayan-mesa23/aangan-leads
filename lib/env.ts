// Secrets live only in env (hard rule 10). Nothing here is ever sent to a caller.
export const env = {
  // Database — a plain Postgres URL. Works with Neon or Supabase.
  DATABASE_URL: process.env.DATABASE_URL ?? '',

  VAANI_API_KEY: process.env.VAANI_API_KEY ?? '',
  VAANI_AGENT_ID: process.env.VAANI_AGENT_ID ?? '',
  VAANI_PHONE_NUMBER: process.env.VAANI_PHONE_NUMBER ?? '',
  VAANI_WEBHOOK_SECRET: process.env.VAANI_WEBHOOK_SECRET ?? '',
  VAANI_TOOL_SECRET: process.env.VAANI_TOOL_SECRET ?? '',

  // Calendly v2. CALENDLY_API_KEY is a personal access token; the event type is
  // its full URI (https://api.calendly.com/event_types/<uuid>).
  CALENDLY_API_KEY: process.env.CALENDLY_API_KEY ?? '',
  CALENDLY_EVENT_TYPE_URI: process.env.CALENDLY_EVENT_TYPE_URI ?? '',
  /** Only set this if the event type HAS a location, e.g. "physical" or "google_conference". */
  CALENDLY_LOCATION_KIND: process.env.CALENDLY_LOCATION_KIND ?? '',
  CALENDLY_WEBHOOK_SIGNING_KEY: process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? '',

  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',
  TELEGRAM_DESIGNER_CHAT_ID: process.env.TELEGRAM_DESIGNER_CHAT_ID ?? '',
  TELEGRAM_OWNER_CHAT_ID: process.env.TELEGRAM_OWNER_CHAT_ID ?? '',

  HUBSPOT_PRIVATE_APP_TOKEN: process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? '',
  HUBSPOT_PIPELINE_ID: process.env.HUBSPOT_PIPELINE_ID ?? '',

  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  CRON_SECRET: process.env.CRON_SECRET ?? '',
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me-32chars',

  COST_VAANI_INR_PER_MIN: num(process.env.COST_VAANI_INR_PER_MIN, 6),
  COST_GEMINI_INR_PER_1K_INPUT: num(process.env.COST_GEMINI_INR_PER_1K_INPUT, 0.025),
  COST_GEMINI_INR_PER_1K_OUTPUT: num(process.env.COST_GEMINI_INR_PER_1K_OUTPUT, 0.21),
};

function num(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
}

/** True when a dependency is wired. Every integration degrades to a no-op without it. */
export const has = {
  db: () => !!env.DATABASE_URL,
  gemini: () => !!env.GEMINI_API_KEY,
  telegram: () => !!env.TELEGRAM_BOT_TOKEN,
  calendly: () => !!env.CALENDLY_API_KEY && !!env.CALENDLY_EVENT_TYPE_URI,
  hubspot: () => !!env.HUBSPOT_PRIVATE_APP_TOKEN && !!env.HUBSPOT_PIPELINE_ID,
};
