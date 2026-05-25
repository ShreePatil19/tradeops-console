import { kv } from "@/lib/kv";
import { log } from "@/lib/log";

// ---------------------------------------------------------------------------
// Input size caps (Issue #47)
// ---------------------------------------------------------------------------

export const INPUT_CAPS = {
  invoice: { maxBytes: 10 * 1024 * 1024, maxPdfPages: 20 }, // 10 MB PDF
  inbox: { maxBytes: 4 * 1024 },     // 4 KB email
  compliance: { maxBytes: 500 },     // 500 B counterparty name
  qa: { maxBytes: 1024 },            // 1 KB question
} as const;

export type AgentSlug = keyof typeof INPUT_CAPS;

export function checkInputSize(
  agent: AgentSlug,
  bytes: number
): { ok: boolean; reason?: string } {
  const { maxBytes } = INPUT_CAPS[agent];
  if (bytes > maxBytes) {
    return {
      ok: false,
      reason: `Input exceeds ${maxBytes} bytes limit for agent "${agent}" (got ${bytes} bytes).`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Prompt-injection detection (Issue #48)
// ---------------------------------------------------------------------------

export const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|the\s+)?(previous|prior|above)\s+instructions/i,
  /(reveal|show|print|disclose|leak)\s+(your\s+|the\s+)?system\s+prompt/i,
  /(reveal|show|print|disclose|leak)\s+(your\s+|the\s+)?(api[_\s-]?key|password|secret)/i,
  /you\s+are\s+now\s+(a|an|the)\s+/i,
  /forget\s+everything\s+(above|before)/i,
];

export function detectInjection(text: string): { hit: boolean; pattern?: string } {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { hit: true, pattern: pattern.source };
    }
  }
  return { hit: false };
}

// ---------------------------------------------------------------------------
// Route-level injection guard with KV penalty (Issue #48)
// ---------------------------------------------------------------------------

const PENALTY_TTL_SECONDS = 3600;

export async function applyInjectionPenalty(ip: string): Promise<void> {
  const penaltyKey = `rl:ip:${ip}:penalty`;
  try {
    await kv.set(penaltyKey, 1);
    await kv.expire(penaltyKey, PENALTY_TTL_SECONDS);
  } catch {
    // KV unavailability must not block the guard response.
  }
}

export async function guardInput(
  text: string,
  ip: string,
  trace_id: string,
  agent: AgentSlug
): Promise<{ blocked: boolean }> {
  const result = detectInjection(text);
  if (!result.hit) return { blocked: false };

  log({
    trace_id,
    agent,
    event: "injection_attempt",
    // Log matched pattern source only; never log the raw user text.
    matched_pattern: result.pattern,
    status: 429,
  });

  await applyInjectionPenalty(ip);
  return { blocked: true };
}

// ---------------------------------------------------------------------------
// Citation validator (Issue #50)
// ---------------------------------------------------------------------------

const CITATION_RE = /\[([a-z0-9][a-z0-9_-]*)\]/gi;

export function validateCitations(
  text: string,
  validIds: string[]
): { invalidIds: string[] } {
  const valid = new Set(validIds);
  const found = new Set<string>();

  let match: RegExpExecArray | null;
  // Reset lastIndex since the regex has the 'g' flag.
  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    const id = match[1];
    if (id !== undefined) found.add(id);
  }

  const invalidIds = Array.from(found).filter((id) => !valid.has(id));
  return { invalidIds };
}
