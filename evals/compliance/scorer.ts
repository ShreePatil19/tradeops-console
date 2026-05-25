// Compliance scorer: parses the VERDICT line from the agent's final assistant
// text and checks sanctions recall and false-positive rate.
//
// Scoring rules:
//   - Hits (5 cases): verdict must contain "hit". 100% recall required (5/5).
//   - Clears (10 cases): verdict must say "clear" or "inconclusive".
//     <=10% false positive rate allowed, meaning at least 9 of 10 clears must
//     return a non-hit verdict.
//
// The overall suite passes when BOTH conditions hold simultaneously.
// Precision and recall are printed to stdout as part of the run report.
//
// The VERDICT line format expected from the agent:
//   VERDICT: hit
//   VERDICT: clear
//   VERDICT: inconclusive
//   (case-insensitive; "hit" substring is enough to flag a hit)

import type { EvalCase, EvalResult } from '../types.js';

type ComplianceCase = EvalCase & {
  expected?: {
    verdict: 'hit' | 'clear';
    matchedEntity?: string;
  };
};

// Parse the VERDICT token from the agent's text output.
// Looks for a line matching "VERDICT: <token>" (case-insensitive).
// Returns the token in lowercase, or null if not found.
function parseVerdict(text: string): string | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/\bverdict\s*[:=]\s*(\S+)/i);
    if (m) {
      return m[1].toLowerCase().replace(/[^a-z]/g, '');
    }
  }
  return null;
}

// Check whether the parsed verdict counts as a "hit" detection.
function isHitVerdict(verdict: string): boolean {
  return verdict.includes('hit') || verdict === 'sanctioned' || verdict === 'blocked';
}

// Check whether the parsed verdict counts as "clear" or "inconclusive".
function isClearOrInconclusive(verdict: string): boolean {
  return (
    verdict.includes('clear') ||
    verdict.includes('inconclusive') ||
    verdict.includes('noMatch') ||
    verdict === 'notfound' ||
    verdict === 'nomatch' ||
    verdict === 'ok'
  );
}

// Aggregate across all cases: compute hit recall and clear false-positive rate.
// These metrics are printed to stdout after each individual case.
type AggState = {
  hitTotal: number;
  hitDetected: number;
  clearTotal: number;
  clearFalsePositive: number;
};

// Module-level aggregate (reset on each run via the run harness calling scorer fresh).
// Since the harness calls the scorer per-case, we accumulate state in a closure.
// The approach: export a factory that captures state, but since run.ts imports the
// named function directly we keep a module-scoped counter and print summary at the
// end. The harness currently does not call a teardown hook, so we print a summary
// lazily the first time the count is complete.
const agg: AggState = {
  hitTotal: 0,
  hitDetected: 0,
  clearTotal: 0,
  clearFalsePositive: 0,
};

// Track which case IDs have been processed to detect a full run.
const processedIds = new Set<string>();

const HIT_CASE_COUNT = 5;
const CLEAR_CASE_COUNT = 10;

function maybePrintSummary(): void {
  const totalReal = HIT_CASE_COUNT + CLEAR_CASE_COUNT;
  if (processedIds.size === totalReal) {
    const hitRecall =
      agg.hitTotal > 0 ? agg.hitDetected / agg.hitTotal : 1;
    const clearFpRate =
      agg.clearTotal > 0 ? agg.clearFalsePositive / agg.clearTotal : 0;
    const clearPrecision =
      agg.hitDetected + agg.clearTotal - agg.clearFalsePositive > 0
        ? agg.hitDetected /
          (agg.hitDetected + agg.clearFalsePositive)
        : 1;

    console.log('');
    console.log('  [compliance] Precision/Recall Report:');
    console.log(
      `    Hit recall:       ${agg.hitDetected}/${agg.hitTotal} = ${(hitRecall * 100).toFixed(0)}% (required: 100%)`,
    );
    console.log(
      `    Clear FP rate:    ${agg.clearFalsePositive}/${agg.clearTotal} = ${(clearFpRate * 100).toFixed(0)}% (allowed: <=10%)`,
    );
    console.log(
      `    Precision (hits): ${(clearPrecision * 100).toFixed(0)}%`,
    );
    console.log('');
  }
}

export function scoreCompliance(
  c: EvalCase,
  r: EvalResult,
): { passed: boolean; reason: string } {
  // Starter case passes trivially.
  if (c.id.endsWith('-starter')) {
    return { passed: true, reason: 'scaffold-only starter case; always passes' };
  }

  const compCase = c as ComplianceCase;
  const expectedVerdict = compCase.expected?.verdict;

  if (!expectedVerdict) {
    return { passed: true, reason: 'no expected verdict defined; skipping' };
  }

  const parsedVerdict = parseVerdict(r.text);

  if (parsedVerdict === null) {
    // No VERDICT line found: treat as a failed detection.
    processedIds.add(c.id);

    if (expectedVerdict === 'hit') {
      agg.hitTotal++;
      // hitDetected stays unchanged (miss)
      maybePrintSummary();
      return {
        passed: false,
        reason: 'no VERDICT line found in agent response; expected hit was missed',
      };
    } else {
      // For a clear case, missing verdict is treated as a false positive (uncertain).
      agg.clearTotal++;
      agg.clearFalsePositive++;
      maybePrintSummary();
      return {
        passed: false,
        reason: 'no VERDICT line found in agent response; treating as false positive for a clear case',
      };
    }
  }

  processedIds.add(c.id);

  if (expectedVerdict === 'hit') {
    agg.hitTotal++;
    const detected = isHitVerdict(parsedVerdict);
    if (detected) agg.hitDetected++;
    maybePrintSummary();

    return {
      passed: detected,
      reason: detected
        ? `hit correctly detected; VERDICT="${parsedVerdict}"`
        : `hit missed; VERDICT="${parsedVerdict}" does not indicate a sanctions match`,
    };
  }

  // expectedVerdict === 'clear'
  agg.clearTotal++;
  const falsePositive = isHitVerdict(parsedVerdict) && !isClearOrInconclusive(parsedVerdict);
  if (falsePositive) agg.clearFalsePositive++;
  maybePrintSummary();

  const casePassed = !falsePositive;
  return {
    passed: casePassed,
    reason: casePassed
      ? `clear correctly returned; VERDICT="${parsedVerdict}"`
      : `false positive: VERDICT="${parsedVerdict}" on a clear entity`,
  };
}
