import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";

import { model, requireApiKey } from "@/lib/model";
import { checkSanctions } from "@/lib/sanctions";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a sanctions pre-check agent for an Australian trade operations desk.

Workflow:
1. The user gives you a counterparty name (and optional country).
2. Call check_sanctions exactly once with the name.
3. Read the tool result. The tool searches an internal stub register that covers a subset of OFAC SDN, DFAT, EU, and UN lists. It is NOT comprehensive.
4. Return a verdict in this exact format:

VERDICT: <clear / hit / inconclusive>

Then a short paragraph explaining the reasoning, citing the matched list name and reason if the verdict is "hit". If "clear" or "inconclusive", explicitly note that the stub register is not comprehensive and a full screening through Refinitiv World-Check or Dow Jones Risk & Compliance is still required before transacting.

Rules:
- "hit" requires at least one entry in the tool result with a confident name or alias match.
- "inconclusive" applies when the name is too generic, ambiguous, or partially matches an entity.
- "clear" applies when the tool returns no matches and the name is specific enough to be meaningful.
- Never say "this counterparty is safe to transact with". The verdict is a pre-check, not a final clearance.`;

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
        check_sanctions: tool({
          description:
            "Search the internal stub sanctions register for a counterparty name. Returns matched entries with list, reason, and matched alias.",
          inputSchema: z.object({
            query: z.string().describe("The counterparty name to screen."),
          }),
          execute: async ({ query }) => {
            const result = checkSanctions(query);
            return {
              query,
              matched: result.matched,
              matchCount: result.entries.length,
              entries: result.entries.map((entry) => ({
                name: entry.name,
                aliases: entry.aliases,
                list: entry.list,
                reason: entry.reason,
                addedAt: entry.addedAt,
                matchedOn: entry.matchedOn,
              })),
              note:
                "Stub register only. Covers a small curated subset for demo purposes. Always run a full screen before transacting.",
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
