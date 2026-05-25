import { describe, it, expect } from "vitest";
import { scoreQa } from "../../evals/qa/scorer";
import type { EvalCase, EvalResult } from "../../evals/types";

function makeResult(text: string): EvalResult {
  return { text, toolCalls: [], raw: null };
}

function makeCase(id: string, chunkIds: string[]): EvalCase {
  return {
    id,
    description: `test ${id}`,
    input: { question: "test" },
    expected: { chunkIds },
  } as EvalCase;
}

describe("scoreQa", () => {
  it("starter case passes trivially regardless of result text", () => {
    const verdict = scoreQa(
      { id: "qa-starter", description: "starter", input: null } as EvalCase,
      makeResult("")
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/scaffold-only/);
  });

  it("fails when an unknown chunk ID is cited", () => {
    const verdict = scoreQa(
      makeCase("qa-1", ["incoterms-fob"]),
      makeResult("FOB is defined under Incoterms [incoterms-fob] and [made-up-id].")
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/made-up-id/);
  });

  it("passes when all citations are valid and recall is 100%", () => {
    const verdict = scoreQa(
      makeCase("qa-2", ["incoterms-fob", "incoterms-fca"]),
      makeResult(
        "FOB [incoterms-fob] and FCA [incoterms-fca] differ in carrier handover."
      )
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/citation validity/);
  });

  it("passes when recall is exactly 80%", () => {
    const verdict = scoreQa(
      makeCase("qa-3", [
        "incoterms-fob",
        "incoterms-fca",
        "incoterms-cif",
        "incoterms-dap",
        "incoterms-ddp",
      ]),
      makeResult(
        "Discussion of [incoterms-fob], [incoterms-fca], [incoterms-cif], [incoterms-dap]."
      )
    );
    expect(verdict.passed).toBe(true);
  });

  it("fails when recall is below 80%", () => {
    const verdict = scoreQa(
      makeCase("qa-4", ["incoterms-fob", "incoterms-fca", "incoterms-cif", "incoterms-ddp", "incoterms-dap"]),
      makeResult("Only [incoterms-fob] is cited here.")
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/recall/);
  });

  it("treats answers with no citations and no expected ids as pass", () => {
    const verdict = scoreQa(
      makeCase("qa-5", []),
      makeResult("Plain answer with no citations at all.")
    );
    expect(verdict.passed).toBe(true);
  });

  it("ignores text in [brackets] that does not match the chunk-id pattern", () => {
    const verdict = scoreQa(
      makeCase("qa-6", ["au-import-gst"]),
      makeResult("GST applies [au-import-gst]. Note [123-only-digits-fine].")
    );
    // 123-only-digits-fine matches the regex but is not in CORPUS_IDS, so verdict fails.
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/123-only-digits-fine/);
  });
});
