// Inbox scorer: checks that the model's classify_email tool call output matches
// the expected category exactly.
//
// Pass threshold: 90% (9 out of 10 labeled cases must be correct).
//
// Category contract (exact strings):
//   "rfq"       - Request for quotation
//   "order"     - Purchase order or order amendment
//   "complaint" - Complaint or claim
//   "spam"      - Unsolicited / fraudulent email
//   "info"      - General information request
//
// Additional assertion (not graded): for non-spam categories the draft reply
// produced by the agent must be non-empty. A warning is logged when this fails
// but it does not affect the pass/fail result.

import type { EvalCase, EvalResult } from '../types.js';

const VALID_CATEGORIES = ['rfq', 'order', 'complaint', 'spam', 'info'] as const;
type Category = (typeof VALID_CATEGORIES)[number];

type InboxCase = EvalCase & {
  expected?: {
    category: Category;
  };
};

// Attempt to extract the category from the classify_email tool call.
// The tool input may use various field names; try common variants.
function extractCategory(toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== 'object') return null;

  const obj = toolInput as Record<string, unknown>;

  const candidateFields = ['category', 'classification', 'label', 'type'];
  for (const field of candidateFields) {
    const val = obj[field];
    if (typeof val === 'string' && val.trim() !== '') {
      return val.trim().toLowerCase();
    }
  }

  return null;
}

// Check that a draft reply string is non-empty (whitespace-only counts as empty).
function draftIsNonEmpty(text: string): boolean {
  return text.trim().length > 0;
}

export function scoreInbox(
  c: EvalCase,
  r: EvalResult,
): { passed: boolean; reason: string } {
  // Starter case passes trivially.
  if (c.id.endsWith('-starter')) {
    return { passed: true, reason: 'scaffold-only starter case; always passes' };
  }

  const inboxCase = c as InboxCase;
  const expectedCategory = inboxCase.expected?.category;

  if (!expectedCategory) {
    return { passed: true, reason: 'no expected category defined; skipping' };
  }

  // Locate the classify_email tool call.
  const toolCall = r.toolCalls.find((tc) => tc.name === 'classify_email');

  if (!toolCall) {
    return {
      passed: false,
      reason: `no classify_email tool call found; ${r.toolCalls.length} tool call(s) observed: [${r.toolCalls.map((t) => t.name).join(', ')}]`,
    };
  }

  const observedCategory = extractCategory(toolCall.input);

  if (observedCategory === null) {
    return {
      passed: false,
      reason: `classify_email tool call did not include a recognisable category field; input was: ${JSON.stringify(toolCall.input).slice(0, 200)}`,
    };
  }

  const categoryMatch = observedCategory === expectedCategory;

  // Non-graded draft assertion: warn if draft text is empty for non-spam.
  if (expectedCategory !== 'spam' && !draftIsNonEmpty(r.text)) {
    console.warn(
      `  [WARN] ${c.id}: expected non-empty draft reply for category "${expectedCategory}" but agent produced empty text`,
    );
  }

  if (!categoryMatch) {
    return {
      passed: false,
      reason: `category mismatch: expected "${expectedCategory}", got "${observedCategory}"`,
    };
  }

  return {
    passed: true,
    reason: `category matched: "${observedCategory}"`,
  };
}
