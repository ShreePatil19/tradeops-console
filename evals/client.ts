// HTTP client that posts to /api/agents/<slug> and collects the UIMessageStream response.

import type { AgentSlug, EvalResult } from './types.js';

const DEFAULT_BASE_URL =
  process.env.EVAL_BASE_URL ?? 'http://localhost:3000';

// TODO: Replace the raw-text collector below with a proper streaming parser
// that handles each Server-Sent Events chunk emitted by the Vercel AI SDK
// UIMessageStream format (e.g. "0:", "2:", "d:" prefixed lines).
// For the scaffold, we collect the full body as text and do a best-effort
// extraction of assistant text and tool-call entries.

function parseRawStream(raw: string): Pick<EvalResult, 'text' | 'toolCalls'> {
  const lines = raw.split('\n');
  const textParts: string[] = [];
  const toolCalls: EvalResult['toolCalls'] = [];

  for (const line of lines) {
    // Vercel AI SDK UIMessageStream lines are prefixed with a type code and colon.
    // "0:" => text delta; "9:" => tool call; "a:" => tool result; "d:" => finish.
    const textMatch = line.match(/^0:"(.*)"$/);
    if (textMatch) {
      try {
        textParts.push(JSON.parse(`"${textMatch[1]}"`));
      } catch {
        textParts.push(textMatch[1]);
      }
      continue;
    }

    const toolMatch = line.match(/^9:(.+)$/);
    if (toolMatch) {
      try {
        const parsed = JSON.parse(toolMatch[1]) as {
          toolName?: string;
          args?: unknown;
        };
        toolCalls.push({
          name: parsed.toolName ?? 'unknown',
          input: parsed.args ?? null,
        });
      } catch {
        // Ignore unparseable tool-call lines.
      }
    }

    const toolResultMatch = line.match(/^a:(.+)$/);
    if (toolResultMatch) {
      try {
        const parsed = JSON.parse(toolResultMatch[1]) as {
          result?: unknown;
        };
        const last = toolCalls[toolCalls.length - 1];
        if (last) {
          last.output = parsed.result;
        }
      } catch {
        // Ignore unparseable tool-result lines.
      }
    }
  }

  return { text: textParts.join(''), toolCalls };
}

export async function callAgent(
  slug: AgentSlug,
  messages: unknown[],
  options?: { baseUrl?: string },
): Promise<EvalResult> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${base}/api/agents/${slug}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Agent ${slug} returned HTTP ${response.status}: ${raw.slice(0, 200)}`,
    );
  }

  const { text, toolCalls } = parseRawStream(raw);

  return { text, toolCalls, raw };
}
