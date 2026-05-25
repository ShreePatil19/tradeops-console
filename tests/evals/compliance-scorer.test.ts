import { describe, it, expect } from "vitest";
import { scoreCompliance } from "../../evals/compliance/scorer";
import type { EvalCase, EvalResult } from "../../evals/types";

type ExpectedVerdict = "hit" | "clear";

function makeCase(id: string, verdict?: ExpectedVerdict): EvalCase {
  return {
    id,
    description: `test ${id}`,
    input: { counterparty: "stub" },
    expected: verdict ? { verdict } : undefined,
  } as EvalCase;
}

function makeResult(text: string): EvalResult {
  return { text, toolCalls: [], raw: null };
}

describe("scoreCompliance", () => {
  it("starter case passes trivially without inspecting results", () => {
    const verdict = scoreCompliance(
      { id: "compliance-starter", description: "starter", input: null } as EvalCase,
      makeResult("")
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/scaffold-only/);
  });

  it("passes when the case has no expected verdict", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-no-expected"),
      makeResult("anything")
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/no expected verdict/);
  });

  it("passes a hit case when the agent VERDICT line says hit", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-hit-detected", "hit"),
      makeResult("VERDICT: hit\nMatched entity in OFAC SDN.")
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/hit correctly detected/);
  });

  it("fails a hit case when the agent VERDICT line says clear", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-hit-missed", "hit"),
      makeResult("VERDICT: clear\nNo matches found.")
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/hit missed/);
  });

  it("fails when the agent response has no VERDICT line on a hit case", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-hit-no-verdict", "hit"),
      makeResult("I checked the sanctions register and found something.")
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/no VERDICT line/);
  });

  it("passes a clear case when the agent VERDICT line says clear", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-clear-pass", "clear"),
      makeResult("VERDICT: clear\nNo entries matched in the stub register.")
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/clear correctly returned/);
  });

  it("passes a clear case when the agent returns an inconclusive verdict", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-clear-inconclusive", "clear"),
      makeResult("VERDICT: inconclusive\nName is too generic to screen.")
    );
    expect(verdict.passed).toBe(true);
  });

  it("fails a clear case as false positive when the agent VERDICT line says hit", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-clear-fp", "clear"),
      makeResult("VERDICT: hit\nThe agent flagged a benign entity.")
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/false positive/);
  });

  it("treats a clear case with no VERDICT line as a false positive failure", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-clear-no-verdict", "clear"),
      makeResult("Some prose with no structured verdict.")
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/treating as false positive/);
  });

  it("parses VERDICT case-insensitively (verdict: HIT)", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-case-insensitive", "hit"),
      makeResult("verdict: HIT\nLowercase verdict label.")
    );
    expect(verdict.passed).toBe(true);
  });

  it("treats VERDICT: sanctioned as a hit detection synonym", () => {
    const verdict = scoreCompliance(
      makeCase("compliance-sanctioned-synonym", "hit"),
      makeResult("VERDICT: sanctioned\nOFAC SDN match.")
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/hit correctly detected/);
  });
});
