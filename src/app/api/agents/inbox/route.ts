import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";

import { model, requireApiKey } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

const CATEGORIES = ["rfq", "order", "complaint", "spam", "info"] as const;

const SYSTEM_PROMPT = `You are an inbox triage agent for an Australian trade operations desk.

Workflow for each email:
1. Read the email.
2. Call classify_email exactly once with the category and a confidence (0 to 1).
3. If the category is rfq, order, complaint, or info, call draft_reply exactly once with a professional, concise reply (Australian English, no em-dashes, no exclamation marks, plain prose).
4. If the category is spam, do not call draft_reply. Instead, write one sentence explaining why it was classified as spam.
5. After the tool calls, write a one-line summary an analyst can scan: "<category>: <one-line action>".

Categories:
- rfq: a request for quotation, pricing, or availability.
- order: a confirmed purchase order or instruction to ship.
- complaint: a problem with goods, delivery, invoicing, or service.
- spam: marketing blast, phishing, irrelevant solicitation.
- info: informational update, no action required.

Drafts must:
- Address the sender by name if known, otherwise use a neutral greeting.
- Acknowledge the specific request or issue.
- State the next action and a realistic timeframe.
- Sign off as "TradeOps Desk".`;

export async function POST(req: Request) {
  try {
    requireApiKey();
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(4),
      tools: {
        classify_email: tool({
          description: "Classify the email and record the category with a confidence score.",
          inputSchema: z.object({
            category: z.enum(CATEGORIES),
            confidence: z.number().min(0).max(1),
            reasoning: z.string().describe("One sentence explaining the choice."),
          }),
          execute: async (input) => ({
            recorded: true,
            category: input.category,
            confidence: input.confidence,
          }),
        }),
        draft_reply: tool({
          description:
            "Draft a professional reply. Only call this when the category is rfq, order, complaint, or info.",
          inputSchema: z.object({
            subject: z.string(),
            body: z.string(),
            nextAction: z
              .string()
              .describe("The concrete next step the desk should take (1 sentence)."),
          }),
          execute: async (input) => ({
            drafted: true,
            subject: input.subject,
            wordCount: input.body.split(/\s+/).filter(Boolean).length,
          }),
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(message, { status: 500 });
  }
}
