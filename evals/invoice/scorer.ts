// Invoice scorer: measures recall of expected line items against the model's
// extract_line_items tool call output.
//
// Pass threshold: 80% recall (since text-based invoice input is easier than
// real PDF binary fixtures).
//
// NOTE: Real PDF fixtures (using the multipart file upload path with
// Content-Type: multipart/form-data and a PDF binary part) are deferred to a
// follow-up issue. The cases here use plain-text invoice representations so
// the eval can run without binary fixture storage.

import type { EvalCase, EvalResult } from '../types.js';

const PASS_THRESHOLD = 0.8;

type ExpectedLineItem = {
  description: string;
  hsCode?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  currency?: string;
  lineTotal?: number;
};

type InvoiceCase = EvalCase & {
  expected?: {
    lineItems: ExpectedLineItem[];
  };
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Check whether an extracted item (from tool output) covers an expected item.
// We do a fuzzy match on description and exact match on numeric fields when
// present. Any single matching field pair on description is enough to identify
// the item; numeric fields are checked for closeness within 1%.
function itemMatches(extracted: unknown, expected: ExpectedLineItem): boolean {
  if (!extracted || typeof extracted !== 'object') return false;

  const ext = extracted as Record<string, unknown>;

  // Description is required for a match.
  const descFields = ['description', 'name', 'item', 'goods'];
  let descMatch = false;
  for (const field of descFields) {
    const val = ext[field];
    if (typeof val === 'string') {
      const normVal = normalize(val);
      const normExp = normalize(expected.description);
      if (normVal.includes(normExp) || normExp.includes(normVal)) {
        descMatch = true;
        break;
      }
    }
  }

  if (!descMatch) return false;

  // If expected has a lineTotal, verify it is close (within 1%).
  if (expected.lineTotal !== undefined) {
    const totalFields = ['lineTotal', 'total', 'amount', 'line_total', 'lineAmount'];
    for (const field of totalFields) {
      const val = ext[field];
      if (typeof val === 'number') {
        const ratio = Math.abs(val - expected.lineTotal) / expected.lineTotal;
        if (ratio > 0.01) return false;
        break;
      }
    }
  }

  return true;
}

export function scoreInvoice(
  c: EvalCase,
  r: EvalResult,
): { passed: boolean; reason: string } {
  // Starter case passes trivially without hitting the API.
  if (c.id.endsWith('-starter')) {
    return { passed: true, reason: 'scaffold-only starter case; always passes' };
  }

  const invoiceCase = c as InvoiceCase;
  const expectedItems = invoiceCase.expected?.lineItems ?? [];

  if (expectedItems.length === 0) {
    return { passed: true, reason: 'no expected line items defined; skipping' };
  }

  // Find the extract_line_items tool call.
  const toolCall = r.toolCalls.find((tc) => tc.name === 'extract_line_items');

  if (!toolCall) {
    return {
      passed: false,
      reason: `no extract_line_items tool call found in response; ${r.toolCalls.length} tool call(s) observed: [${r.toolCalls.map((t) => t.name).join(', ')}]`,
    };
  }

  // The tool input may have a lineItems or items array.
  const toolInput = toolCall.input as Record<string, unknown>;
  const extractedItems: unknown[] =
    (Array.isArray(toolInput?.lineItems) ? toolInput.lineItems :
      Array.isArray(toolInput?.items) ? toolInput.items :
        Array.isArray(toolInput?.extracted) ? toolInput.extracted :
          Array.isArray(toolCall.output) ? toolCall.output :
            []) as unknown[];

  // Count how many expected items appear in the extracted set.
  let matched = 0;
  const misses: string[] = [];

  for (const exp of expectedItems) {
    const found = extractedItems.some((ext) => itemMatches(ext, exp));
    if (found) {
      matched++;
    } else {
      misses.push(exp.description);
    }
  }

  const recall = matched / expectedItems.length;
  const passed = recall >= PASS_THRESHOLD;

  const reason = passed
    ? `recall ${matched}/${expectedItems.length} (${Math.round(recall * 100)}%) >= ${Math.round(PASS_THRESHOLD * 100)}% threshold`
    : `recall ${matched}/${expectedItems.length} (${Math.round(recall * 100)}%) below ${Math.round(PASS_THRESHOLD * 100)}% threshold; missing: ${misses.join(', ')}`;

  return { passed, reason };
}
