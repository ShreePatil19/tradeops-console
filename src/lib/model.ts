import { google } from "@ai-sdk/google";

export const MODEL_ID = "gemini-2.5-flash";

export const model = google(MODEL_ID);

export function requireApiKey() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey, then add it to .env.local for local dev and to Vercel project env vars for production."
    );
  }
}
