import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";

import { model, requireApiKey } from "@/lib/model";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an invoice extraction agent for an Australian trade operations desk.

Workflow:
1. The user provides a supplier invoice as a PDF.
2. Read the document. Briefly state the supplier name and document type in one sentence.
3. Call the extract_line_items tool exactly once with every line item you can identify, including a confidence score (0 to 1) per row reflecting how clearly each field was readable.
4. After the tool call, write one short paragraph noting any anomalies: missing fields, unusual unit prices, partial pages, handwritten annotations, or anything an ops analyst should double-check.

Rules:
- Currencies must be normalised to ISO codes (AUD, USD, EUR, CNY, etc.). If the document only shows a symbol, infer the most likely ISO code and lower the confidence by 0.1.
- Numeric fields must be numbers, not strings. Use null if a value is genuinely missing rather than guessing.
- Do not invent data. If you cannot read a row, omit it. Mention omissions in the anomalies note.`;

export async function POST(req: Request) {
  try {
    requireApiKey();
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(3),
      tools: {
        extract_line_items: tool({
          description:
            "Capture the structured line items extracted from the invoice. Call this exactly once after reading the document.",
          inputSchema: z.object({
            supplier: z.string().describe("Supplier company name as shown on the invoice."),
            invoiceNumber: z.string().nullable(),
            invoiceDate: z
              .string()
              .nullable()
              .describe("ISO 8601 date (YYYY-MM-DD) if determinable, else null."),
            currency: z
              .string()
              .nullable()
              .describe("ISO 4217 currency code (e.g., AUD, USD)."),
            lineItems: z.array(
              z.object({
                description: z.string(),
                quantity: z.number().nullable(),
                unitPrice: z.number().nullable(),
                total: z.number().nullable(),
                confidence: z
                  .number()
                  .min(0)
                  .max(1)
                  .describe("Your confidence (0 to 1) that this row was extracted accurately."),
              })
            ),
            grandTotal: z.number().nullable(),
          }),
          execute: async (input) => {
            const sum = input.lineItems.reduce((s, li) => s + (li.total ?? 0), 0);
            const avgConfidence =
              input.lineItems.length > 0
                ? input.lineItems.reduce((s, li) => s + li.confidence, 0) / input.lineItems.length
                : 0;
            return {
              captured: true,
              lineCount: input.lineItems.length,
              sumOfLineTotals: Number(sum.toFixed(2)),
              averageConfidence: Number(avgConfidence.toFixed(2)),
              currency: input.currency ?? "unknown",
            };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(message, { status: 500 });
  }
}
