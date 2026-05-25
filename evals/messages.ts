// Build the messages payload that the eval client sends to /api/agents/<slug>.
//
// Two case shapes are supported:
//
//   Text-based cases: `c.input` is an array of UIMessage-shaped objects (the
//   legacy form). buildMessagesFromCase returns it unchanged.
//
//   Fixture-based cases: `c.fixture` is a string path under
//   evals/invoice/fixtures/. buildMessagesFromCase reads the PDF, base64-encodes
//   it, and wraps it in a user message with a text prompt + file part. Optional
//   `c.userText` overrides the default prompt.
//
// The route at /api/agents/invoice already accepts JSON messages with type:
// "file" parts (the UI uses the same shape). No multipart/form-data needed.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { EvalCase } from "./types.js";

export const DEFAULT_INVOICE_PROMPT =
  "Extract the line items from this supplier invoice. Use the extract_line_items tool.";

const FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "invoice",
  "fixtures"
);

export function isFixtureCase(c: EvalCase): boolean {
  const fixture = (c as { fixture?: unknown }).fixture;
  return typeof fixture === "string" && fixture.trim() !== "";
}

export function buildMessagesFromCase(c: EvalCase): unknown[] {
  if (isFixtureCase(c)) {
    const fixture = (c as { fixture?: unknown }).fixture as string;
    const path = resolve(FIXTURES_DIR, fixture);
    if (!existsSync(path)) {
      throw new Error(
        `eval fixture not found: ${fixture} (expected at ${path})`
      );
    }
    const bytes = readFileSync(path);
    const base64 = bytes.toString("base64");
    const rawUserText = (c as { userText?: unknown }).userText;
    const userText =
      typeof rawUserText === "string" && rawUserText.trim() !== ""
        ? rawUserText
        : DEFAULT_INVOICE_PROMPT;
    return [
      {
        role: "user",
        parts: [
          { type: "text", text: userText },
          {
            type: "file",
            mediaType: "application/pdf",
            url: `data:application/pdf;base64,${base64}`,
            filename: fixture,
          },
        ],
      },
    ];
  }
  return Array.isArray(c.input) ? (c.input as unknown[]) : [];
}
