import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildInvoicePdf,
  buildAllFixtures,
  FIXTURE_SPECS,
  type InvoiceSpec,
} from "../../evals/invoice/fixtures/build";

function baseSpec(): InvoiceSpec {
  return {
    supplier: "Singapore Trade Supplies Pte Ltd",
    supplierAddress: "10 Tuas South Ave 2, Singapore 637205",
    buyer: "Pacific Rim Importers Pty Ltd",
    invoiceNumber: "STS-2024-00891",
    invoiceDate: "2024-01-15",
    currency: "USD",
    lineItems: [
      {
        description: "Industrial Grade HDPE Pellets",
        quantity: 5000,
        unit: "kg",
        unitPrice: 1.25,
        lineTotal: 6250.0,
      },
      {
        description: "Polymer Additive Masterbatch",
        quantity: 500,
        unit: "kg",
        unitPrice: 4.8,
        lineTotal: 2400.0,
      },
    ],
    variant: "clean",
  };
}

describe("buildInvoicePdf", () => {
  it("returns bytes starting with the %PDF- magic header", async () => {
    const bytes = await buildInvoicePdf(baseSpec());
    const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
    expect(header).toBe("%PDF-");
  });

  it("produces a one-page PDF for the clean variant", async () => {
    const bytes = await buildInvoicePdf(baseSpec());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("embeds the supplier name in PDF metadata", async () => {
    const spec = baseSpec();
    const bytes = await buildInvoicePdf(spec);
    const doc = await PDFDocument.load(bytes);
    const title = doc.getTitle();
    expect(title).toContain(spec.supplier);
  });

  it("embeds the invoice number in PDF subject metadata", async () => {
    const bytes = await buildInvoicePdf(baseSpec());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getSubject()).toContain("STS-2024-00891");
  });

  it("produces a two-page PDF for the multipage variant", async () => {
    const bytes = await buildInvoicePdf({
      ...baseSpec(),
      variant: "multipage",
      lineItems: Array.from({ length: 24 }, (_, i) => ({
        description: `Item ${i + 1}`,
        quantity: i + 1,
        unit: "pcs",
        unitPrice: 10 + i,
        lineTotal: (i + 1) * (10 + i),
      })),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("marks the stamped variant with a stamp tag in PDF keywords metadata", async () => {
    const bytes = await buildInvoicePdf({ ...baseSpec(), variant: "stamped" });
    const doc = await PDFDocument.load(bytes);
    const keywords = doc.getKeywords() ?? "";
    expect(keywords.toLowerCase()).toContain("stamped");
  });

  it("marks the handwritten variant with a handwritten tag in PDF keywords metadata", async () => {
    const bytes = await buildInvoicePdf({ ...baseSpec(), variant: "handwritten" });
    const doc = await PDFDocument.load(bytes);
    const keywords = doc.getKeywords() ?? "";
    expect(keywords.toLowerCase()).toContain("handwritten");
  });

  it("marks the partial variant with a partial tag in PDF keywords metadata", async () => {
    const bytes = await buildInvoicePdf({
      ...baseSpec(),
      variant: "partial",
      invoiceNumber: undefined,
    });
    const doc = await PDFDocument.load(bytes);
    const keywords = doc.getKeywords() ?? "";
    expect(keywords.toLowerCase()).toContain("partial");
  });

  it("produces deterministic bytes for the same input across two calls", async () => {
    const spec = baseSpec();
    const a = await buildInvoicePdf(spec);
    const b = await buildInvoicePdf(spec);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe("FIXTURE_SPECS", () => {
  it("declares exactly five named fixture specs", () => {
    expect(FIXTURE_SPECS).toHaveLength(5);
    const names = FIXTURE_SPECS.map((s) => s.name).sort();
    expect(names).toEqual([
      "01-clean",
      "02-partial",
      "03-stamped",
      "04-handwritten",
      "05-multipage",
    ]);
  });

  it("covers every InvoiceSpec variant across the five fixtures", () => {
    const variants = FIXTURE_SPECS.map((s) => s.spec.variant).sort();
    expect(variants).toEqual([
      "clean",
      "handwritten",
      "multipage",
      "partial",
      "stamped",
    ]);
  });
});

describe("buildAllFixtures", () => {
  it("returns a Map keyed by fixture name with non-empty PDF bytes per entry", async () => {
    const map = await buildAllFixtures();
    expect(map.size).toBe(5);
    for (const [name, bytes] of map) {
      expect(name).toMatch(/^0[1-5]-/);
      expect(bytes.length).toBeGreaterThan(100);
      expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    }
  });
});
