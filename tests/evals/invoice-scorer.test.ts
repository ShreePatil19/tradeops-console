import { describe, it, expect } from "vitest";
import { scoreInvoice } from "../../evals/invoice/scorer";
import type { EvalCase, EvalResult } from "../../evals/types";

type ExpectedLineItem = {
  description: string;
  lineTotal?: number;
};

function makeCase(id: string, lineItems: ExpectedLineItem[] = []): EvalCase {
  return {
    id,
    description: `test ${id}`,
    input: { invoiceText: "stub" },
    expected: { lineItems },
  } as EvalCase;
}

function makeResult(toolInput: unknown): EvalResult {
  return {
    text: "",
    toolCalls: [{ name: "extract_line_items", input: toolInput }],
    raw: null,
  };
}

describe("scoreInvoice", () => {
  it("starter case passes trivially without inspecting results", () => {
    const verdict = scoreInvoice(
      { id: "invoice-starter", description: "starter", input: null } as EvalCase,
      { text: "", toolCalls: [], raw: null }
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/scaffold-only/);
  });

  it("passes when no expected line items are defined", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-empty", []),
      { text: "", toolCalls: [], raw: null }
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/no expected line items/);
  });

  it("fails when no extract_line_items tool call is present", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-no-tool", [{ description: "widget" }]),
      { text: "", toolCalls: [{ name: "other_tool", input: {} }], raw: null }
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/no extract_line_items tool call/);
    expect(verdict.reason).toMatch(/other_tool/);
  });

  it("passes with 100% recall when every expected description matches", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-full-recall", [
        { description: "Steel widget" },
        { description: "Brass gizmo" },
      ]),
      makeResult({
        lineItems: [
          { description: "Steel Widget", quantity: 10, unitPrice: 5 },
          { description: "Brass Gizmo", quantity: 4, unitPrice: 12 },
        ],
      })
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/2\/2/);
    expect(verdict.reason).toMatch(/100%/);
  });

  it("passes when description matches via an alternative field name like 'name'", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-alt-field", [{ description: "Copper pipe" }]),
      makeResult({
        lineItems: [{ name: "Copper Pipe 20mm", quantity: 1, total: 100 }],
      })
    );
    expect(verdict.passed).toBe(true);
  });

  it("falls back to the 'items' array when 'lineItems' is not present", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-items-key", [{ description: "Aluminum sheet" }]),
      makeResult({
        items: [{ description: "Aluminum sheet 1mm", quantity: 5 }],
      })
    );
    expect(verdict.passed).toBe(true);
  });

  it("fails when extracted lineTotal differs from expected by more than 1%", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-total-off", [
        { description: "Steel widget", lineTotal: 100 },
      ]),
      makeResult({
        lineItems: [{ description: "Steel widget", lineTotal: 150 }],
      })
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/Steel widget/);
  });

  it("passes when extracted total is within 1% of expected lineTotal", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-total-close", [
        { description: "Brass gizmo", lineTotal: 100 },
      ]),
      makeResult({
        lineItems: [{ description: "Brass gizmo", total: 100.5 }],
      })
    );
    expect(verdict.passed).toBe(true);
  });

  it("passes at exactly the 80% recall threshold (4 of 5 expected items matched)", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-threshold", [
        { description: "item one" },
        { description: "item two" },
        { description: "item three" },
        { description: "item four" },
        { description: "item five" },
      ]),
      makeResult({
        lineItems: [
          { description: "item one" },
          { description: "item two" },
          { description: "item three" },
          { description: "item four" },
        ],
      })
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toMatch(/4\/5/);
    expect(verdict.reason).toMatch(/80%/);
  });

  it("fails when recall is below 80% and lists the missing item descriptions", () => {
    const verdict = scoreInvoice(
      makeCase("invoice-low-recall", [
        { description: "alpha" },
        { description: "beta" },
        { description: "gamma" },
        { description: "delta" },
        { description: "epsilon" },
      ]),
      makeResult({
        lineItems: [{ description: "alpha" }],
      })
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toMatch(/missing/);
    expect(verdict.reason).toMatch(/beta/);
    expect(verdict.reason).toMatch(/epsilon/);
  });
});
