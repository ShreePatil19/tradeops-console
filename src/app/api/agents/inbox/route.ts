import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";

import { model, requireApiKey, MAX_OUTPUT_TOKENS } from "@/lib/model";
import { bumpRateLimit, bumpGlobalBudget } from "@/lib/rate-limit";
import { log, logError } from "@/lib/log";
import { readTraceFromHeaders, TRACE_HEADER } from "@/lib/trace";

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
  const trace_id = readTraceFromHeaders(req.headers);
  const startTime = Date.now();
  try {
    requireApiKey();
    const { messages }: { messages: UIMessage[] } = await req.json();
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

    const input_chars = messages
      .flatMap((m) => m.parts)
      .filter((p) => p.type === "text")
      .reduce((sum, p) => sum + (p.type === "text" ? p.text.length : 0), 0);

    log({ trace_id, agent: "inbox", event: "request_start", input_chars });

    // TODO(#58): enable caching on inbox once a serialised replay format is ready.
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: MAX_OUTPUT_TOKENS.inbox,
      stopWhen: stepCountIs(4),
      onFinish: () => {
        log({ trace_id, agent: "inbox", event: "request_end", latency_ms: Date.now() - startTime, status: 200 });
        Promise.all([bumpRateLimit(ip, "inbox"), bumpGlobalBudget()]).catch(
          () => {
            /* counter loss is acceptable; never fail the user response */
          }
        );
      },
      tools: {
        classify_email: tool({
          description: "Classify the email and record the category with a confidence score.",
          inputSchema: z.object({
            category: z.enum(CATEGORIES),
            confidence: z.number().min(0).max(1),
            reasoning: z.string().describe("One sentence explaining the choice."),
          }),
          execute: async (input) => {
            log({ trace_id, agent: "inbox", event: "tool_call", tool_name: "classify_email" });
            return {
              recorded: true,
              category: input.category,
              confidence: input.confidence,
            };
          },
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
          execute: async (input) => {
            log({ trace_id, agent: "inbox", event: "tool_call", tool_name: "draft_reply" });
            return {
              drafted: true,
              subject: input.subject,
              wordCount: input.body.split(/\s+/).filter(Boolean).length,
            };
          },
        }),
      },
    });

    const response = result.toUIMessageStreamResponse();
    response.headers.set(TRACE_HEADER, trace_id);
    return response;
  } catch (e) {
    logError(trace_id, "inbox", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(message, { status: 500 });
  }
}
