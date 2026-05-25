import { google } from "@ai-sdk/google";

export const MODEL_ID = "gemini-2.5-flash";

export const model = google(MODEL_ID);

/**
 * Per-agent output token budgets.
 *
 * These caps are passed directly to streamText as maxOutputTokens.
 * Tune them based on observed p99 output lengths to reduce cost.
 *
 * invoice  -- structured extraction + one anomaly paragraph; 2000 is generous
 * inbox    -- classification + short draft reply + one-liner; 800 is sufficient
 * compliance -- verdict + one short paragraph; 600 is sufficient
 * qa       -- three short paragraphs with citations; 1200 covers most answers
 */
export const MAX_OUTPUT_TOKENS = {
  invoice: 2000,
  inbox: 800,
  compliance: 600,
  qa: 1200,
} as const;

export function requireApiKey() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey, then add it to .env.local for local dev and to Vercel project env vars for production."
    );
  }
}
