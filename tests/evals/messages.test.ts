import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildMessagesFromCase,
  isFixtureCase,
  DEFAULT_INVOICE_PROMPT,
} from "../../evals/messages";
import type { EvalCase } from "../../evals/types";

const FIXTURES_DIR = resolve(process.cwd(), "evals/invoice/fixtures");

function textCase(): EvalCase {
  return {
    id: "invoice-01",
    description: "text case",
    input: [
      {
        role: "user",
        content: "Please extract the line items from this invoice text: ...",
      },
    ],
  };
}

function fixtureCase(fixture: string, userText?: string): EvalCase {
  return {
    id: `invoice-pdf-${fixture}`,
    description: `fixture case ${fixture}`,
    input: null,
    fixture,
    ...(userText !== undefined ? { userText } : {}),
  } as EvalCase;
}

describe("isFixtureCase", () => {
  it("returns true when the case has a fixture field", () => {
    expect(isFixtureCase(fixtureCase("01-clean.pdf"))).toBe(true);
  });

  it("returns false when the case has no fixture field", () => {
    expect(isFixtureCase(textCase())).toBe(false);
  });

  it("returns false when the fixture field is not a string", () => {
    expect(
      isFixtureCase({
        id: "x",
        description: "x",
        input: null,
        fixture: 42,
      } as unknown as EvalCase)
    ).toBe(false);
  });

  it("returns false when the fixture field is an empty string", () => {
    expect(isFixtureCase(fixtureCase(""))).toBe(false);
  });
});

describe("buildMessagesFromCase", () => {
  it("returns the input array unchanged for a text-based case", () => {
    const c = textCase();
    const out = buildMessagesFromCase(c);
    expect(out).toEqual(c.input);
  });

  it("returns an empty array when a non-fixture case has a non-array input", () => {
    const out = buildMessagesFromCase({
      id: "x",
      description: "x",
      input: null,
    });
    expect(out).toEqual([]);
  });

  it("builds a user message with text + file parts for a fixture case", () => {
    const messages = buildMessagesFromCase(
      fixtureCase("01-clean.pdf", "Extract the items.")
    );
    expect(messages).toHaveLength(1);
    const msg = messages[0] as {
      role: string;
      parts: Array<{ type: string; text?: string; mediaType?: string; url?: string; filename?: string }>;
    };
    expect(msg.role).toBe("user");
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0]).toEqual({ type: "text", text: "Extract the items." });
    expect(msg.parts[1]?.type).toBe("file");
    expect(msg.parts[1]?.mediaType).toBe("application/pdf");
    expect(msg.parts[1]?.filename).toBe("01-clean.pdf");
  });

  it("uses the default invoice prompt when userText is not supplied", () => {
    const messages = buildMessagesFromCase(fixtureCase("01-clean.pdf"));
    const msg = messages[0] as { parts: Array<{ type: string; text?: string }> };
    expect(msg.parts[0]?.text).toBe(DEFAULT_INVOICE_PROMPT);
  });

  it("base64-encodes the actual PDF bytes from disk", () => {
    const messages = buildMessagesFromCase(fixtureCase("01-clean.pdf"));
    const msg = messages[0] as { parts: Array<{ url?: string }> };
    const url = msg.parts[1]?.url ?? "";
    expect(url.startsWith("data:application/pdf;base64,")).toBe(true);
    const base64 = url.slice("data:application/pdf;base64,".length);
    const decoded = Buffer.from(base64, "base64");
    const onDisk = readFileSync(resolve(FIXTURES_DIR, "01-clean.pdf"));
    expect(decoded.equals(onDisk)).toBe(true);
  });

  it("resolves the fixture from evals/invoice/fixtures and reads the bytes", () => {
    // Smoke check: each known fixture round-trips through the helper.
    const fixtures = [
      "01-clean.pdf",
      "02-partial.pdf",
      "03-stamped.pdf",
      "04-handwritten.pdf",
      "05-multipage.pdf",
    ];
    for (const f of fixtures) {
      const messages = buildMessagesFromCase(fixtureCase(f));
      const msg = messages[0] as { parts: Array<{ url?: string; filename?: string }> };
      expect(msg.parts[1]?.filename).toBe(f);
      expect(msg.parts[1]?.url?.startsWith("data:application/pdf;base64,")).toBe(true);
    }
  });

  it("throws a clear error when the fixture file does not exist", () => {
    expect(() =>
      buildMessagesFromCase(fixtureCase("nonexistent-fixture.pdf"))
    ).toThrow(/nonexistent-fixture\.pdf/);
  });
});
