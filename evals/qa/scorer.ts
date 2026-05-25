// QA scorer: validates citation quality in the agent's final assistant text.
//
// Two metrics are checked and both must pass:
//
//   1. Citation validity (100% required): every chunk ID cited in the response
//      in [chunk-id] notation must exist in the known corpus ID set. Any
//      citation to an unknown ID is a hallucination.
//
//   2. Recall (80% required per case): at least 80% of the expected chunk IDs
//      must appear in the set of citations extracted from the response.
//
// Both metrics are printed to stdout as part of the run report.
//
// Citation format expected from the agent:
//   "...as defined under Incoterms 2020 [incoterms-fob]. For containerised
//    cargo, FCA [incoterms-fca] is recommended..."
//
// The pattern matched is: [ <alphanumeric-and-hyphens> ]

import type { EvalCase, EvalResult } from '../types.js';

// All valid chunk IDs from src/lib/corpus.ts.
const CORPUS_IDS = new Set<string>([
  'incoterms-exw',
  'incoterms-fob',
  'incoterms-cif',
  'incoterms-dap',
  'incoterms-ddp',
  'incoterms-fca',
  'au-import-gst',
  'au-tariff-concession',
  'au-rcep',
  'au-anti-dumping',
]);

const CITATION_PATTERN = /\[([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\]/g;
const RECALL_THRESHOLD = 0.8;

type QaCase = EvalCase & {
  expected?: {
    chunkIds: string[];
  };
};

// Extract all cited chunk IDs from the agent response text.
function extractCitedIds(text: string): Set<string> {
  const cited = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CITATION_PATTERN.source, 'g');
  while ((m = re.exec(text)) !== null) {
    cited.add(m[1]);
  }
  return cited;
}

// Accumulate validity and recall stats across the run for summary reporting.
type QaAgg = {
  totalCitations: number;
  validCitations: number;
  totalExpected: number;
  totalRecalled: number;
  casesProcessed: number;
};

const agg: QaAgg = {
  totalCitations: 0,
  validCitations: 0,
  totalExpected: 0,
  totalRecalled: 0,
  casesProcessed: 0,
};

const REAL_CASE_COUNT = 10;

function maybePrintSummary(): void {
  if (agg.casesProcessed === REAL_CASE_COUNT) {
    const citationValidity =
      agg.totalCitations > 0
        ? agg.validCitations / agg.totalCitations
        : 1;
    const recall =
      agg.totalExpected > 0
        ? agg.totalRecalled / agg.totalExpected
        : 1;

    console.log('');
    console.log('  [qa] Citation Quality Report:');
    console.log(
      `    Citation validity: ${agg.validCitations}/${agg.totalCitations} = ${(citationValidity * 100).toFixed(0)}% (required: 100%)`,
    );
    console.log(
      `    Expected-chunk recall: ${agg.totalRecalled}/${agg.totalExpected} = ${(recall * 100).toFixed(0)}% (required: >=80% per case)`,
    );
    console.log('');
  }
}

export function scoreQa(
  c: EvalCase,
  r: EvalResult,
): { passed: boolean; reason: string } {
  // Starter case passes trivially.
  if (c.id.endsWith('-starter')) {
    return { passed: true, reason: 'scaffold-only starter case; always passes' };
  }

  const qaCase = c as QaCase;
  const expectedChunkIds = qaCase.expected?.chunkIds ?? [];

  const citedIds = extractCitedIds(r.text);

  // 1. Citation validity: every cited ID must exist in the corpus.
  const invalidIds: string[] = [];
  for (const id of citedIds) {
    if (!CORPUS_IDS.has(id)) {
      invalidIds.push(id);
    }
  }

  // 2. Recall: how many expected IDs were cited?
  const recalledIds: string[] = [];
  const missedIds: string[] = [];
  for (const id of expectedChunkIds) {
    if (citedIds.has(id)) {
      recalledIds.push(id);
    } else {
      missedIds.push(id);
    }
  }

  const recall =
    expectedChunkIds.length > 0
      ? recalledIds.length / expectedChunkIds.length
      : 1;

  // Update aggregates.
  agg.casesProcessed++;
  agg.totalCitations += citedIds.size;
  agg.validCitations += citedIds.size - invalidIds.length;
  agg.totalExpected += expectedChunkIds.length;
  agg.totalRecalled += recalledIds.length;

  maybePrintSummary();

  // Determine pass/fail.
  if (invalidIds.length > 0) {
    return {
      passed: false,
      reason: `citation validity failed: ${invalidIds.length} unknown chunk ID(s) cited: [${invalidIds.join(', ')}]`,
    };
  }

  if (recall < RECALL_THRESHOLD) {
    return {
      passed: false,
      reason: `recall ${recalledIds.length}/${expectedChunkIds.length} (${Math.round(recall * 100)}%) below ${Math.round(RECALL_THRESHOLD * 100)}% threshold; missing: [${missedIds.join(', ')}]`,
    };
  }

  return {
    passed: true,
    reason: `citation validity: 100%, recall: ${recalledIds.length}/${expectedChunkIds.length} (${Math.round(recall * 100)}%)`,
  };
}
