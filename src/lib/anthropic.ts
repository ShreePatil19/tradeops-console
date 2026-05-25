import { anthropic } from "@ai-sdk/anthropic";

export const MODEL_ID = "claude-sonnet-4-5";

export const model = anthropic(MODEL_ID);

export function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local for local dev, and to Vercel project env vars for production."
    );
  }
}
