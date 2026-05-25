import { describe, it, expect } from "vitest";
import { scoreInbox } from "../../evals/inbox/scorer";
import type { EvalCase, EvalResult } from "../../evals/types";

type Category = "rfq" | "order" | "complaint" | "spam" | "info";

function makeCase(id: string, category?: Category): EvalCase {
  return {
    id,
    description: `test ${id}`,
    input: { email: "stub" },
    expected: category ? { category } : undefined,
  } as EvalCase;
}

function makeResult(
  toolInput: unknown,
  text = ""
): EvalResult {
  return {
    text,
    toolCalls: [{ name: "classify_email", input: toolInput }],
    raw: null,
  };
}

describe("scoreInbox", () => {
  it("starter case passes trivially without inspecting results", () => {
    const verdict = scoreInbox(
      { id: "inbox-starter", description: "starter", input: null } as EvalCase,
      { text: "", toolCalls: [], raw: null }
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/scaffold-only/);
  });

  it("passes when the case has no expected category", () => {
    const verdict = scoreInbox(
      makeCase("inbox-no-expected"),
      { text: "", toolCalls: [], raw: null }
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/no expected category/);
  });

  it("fails when no classify_email tool call is present", () => {
    const verdict = scoreInbox(
      makeCase("inbox-no-tool", "rfq"),
      {
        text: "",
        toolCalls: [{ name: "draft_reply", input: { body: "hi" } }],
        raw: null,
      }
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/no classify_email tool call/);
    expect(verdict.reason).toMatch(/draft_reply/);
  });

  it("fails when the tool input has no recognisable category field", () => {
    const verdict = scoreInbox(
      makeCase("inbox-bad-input", "rfq"),
      makeResult({ unrelated: "value" })
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/did not include a recognisable category/);
  });

  it("fails when the observed category is outside the allowed enum", () => {
    const verdict = scoreInbox(
      makeCase("inbox-weird", "rfq"),
      makeResult({ category: "newsletter" })
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/not in the allowed set/);
  });

  it("passes when the observed category matches the expected category exactly", () => {
    const verdict = scoreInbox(
      makeCase("inbox-rfq-match", "rfq"),
      makeResult(
        { category: "rfq", confidence: 0.9 },
        "Thanks for your enquiry. We will reply soon."
      )
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/category matched/);
  });

  it("fails when the observed category does not match the expected category", () => {
    const verdict = scoreInbox(
      makeCase("inbox-mismatch", "rfq"),
      makeResult({ category: "spam" })
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/category mismatch/);
    expect(verdict.reason).toMatch(/expected "rfq"/);
    expect(verdict.reason).toMatch(/got "spam"/);
  });

  it("accepts a category supplied via the 'classification' fallback field", () => {
    const verdict = scoreInbox(
      makeCase("inbox-fallback-field", "order"),
      makeResult(
        { classification: "order" },
        "Order confirmed. We will dispatch tomorrow."
      )
    );
    expect(verdict.passed).toBe(true);
  });

  it("normalises observed category to lowercase before matching", () => {
    const verdict = scoreInbox(
      makeCase("inbox-uppercase", "complaint"),
      makeResult(
        { category: "Complaint" },
        "We are sorry to hear that. We will investigate."
      )
    );
    expect(verdict.passed).toBe(true);
  });
});
