// PDF fixture builder for the Invoice Extractor agent.
//
// Generates 5 deterministic PDF fixtures with pdf-lib that exercise the kinds
// of variation a real ops desk sees: a clean invoice, a partial one with
// missing fields, a stamped one with an overlay, a handwritten-style overlay,
// and a multi-page version.
//
// CLI:
//   pnpm fixtures:invoice               # build all 5 PDFs into evals/invoice/fixtures/
//   pnpm fixtures:invoice --check       # verify existing fixtures match what would be generated
//
// The bytes are deterministic: creation/modification dates are pinned to a
// fixed epoch and pdf-lib's producer string is stable, so committing the
// generated PDFs to the repo gives reproducible eval inputs across CI runs.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export type InvoiceLineItem = {
  description: string;
  hsCode?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

export type InvoiceVariant =
  | "clean"
  | "partial"
  | "stamped"
  | "handwritten"
  | "multipage";

export type InvoiceSpec = {
  supplier: string;
  supplierAddress?: string;
  buyer?: string;
  invoiceNumber?: string;
  invoiceDate: string;
  currency: string;
  lineItems: InvoiceLineItem[];
  variant: InvoiceVariant;
};

export type FixtureSpec = {
  name: string;
  spec: InvoiceSpec;
};

const PINNED_DATE = new Date("2024-01-01T00:00:00Z");
const LINE_ITEMS_PER_PAGE = 12;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;

function fmtMoney(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  spec: InvoiceSpec,
  yStart: number
): number {
  let y = yStart;
  page.drawText(spec.supplier, { x: MARGIN, y, size: 16, font: bold });
  y -= 22;
  if (spec.supplierAddress) {
    page.drawText(spec.supplierAddress, { x: MARGIN, y, size: 10, font });
    y -= 18;
  }
  if (spec.buyer) {
    page.drawText(`Bill To: ${spec.buyer}`, { x: MARGIN, y, size: 10, font });
    y -= 18;
  }
  if (spec.invoiceNumber) {
    page.drawText(`Invoice No: ${spec.invoiceNumber}`, {
      x: MARGIN,
      y,
      size: 10,
      font,
    });
    y -= 14;
  }
  page.drawText(`Date: ${spec.invoiceDate}`, { x: MARGIN, y, size: 10, font });
  y -= 22;
  return y;
}

function drawLineItemHeader(page: PDFPage, bold: PDFFont, y: number): number {
  page.drawText("Description", { x: MARGIN, y, size: 10, font: bold });
  page.drawText("Qty", { x: MARGIN + 260, y, size: 10, font: bold });
  page.drawText("Unit", { x: MARGIN + 300, y, size: 10, font: bold });
  page.drawText("Unit Price", { x: MARGIN + 340, y, size: 10, font: bold });
  page.drawText("Line Total", { x: MARGIN + 420, y, size: 10, font: bold });
  return y - 16;
}

function drawLineItem(
  page: PDFPage,
  font: PDFFont,
  item: InvoiceLineItem,
  currency: string,
  y: number
): number {
  page.drawText(item.description, { x: MARGIN, y, size: 10, font });
  page.drawText(String(item.quantity), { x: MARGIN + 260, y, size: 10, font });
  page.drawText(item.unit, { x: MARGIN + 300, y, size: 10, font });
  page.drawText(item.unitPrice.toFixed(2), {
    x: MARGIN + 340,
    y,
    size: 10,
    font,
  });
  page.drawText(fmtMoney(item.lineTotal, currency), {
    x: MARGIN + 420,
    y,
    size: 10,
    font,
  });
  return y - 14;
}

function applyVariantOverlay(
  page: PDFPage,
  font: PDFFont,
  italic: PDFFont,
  variant: InvoiceVariant
): void {
  if (variant === "stamped") {
    page.drawText("RECEIVED  15-MAR-2024  ACCTS REC", {
      x: MARGIN + 100,
      y: PAGE_HEIGHT - 110,
      size: 24,
      font,
      color: rgb(0.85, 0.1, 0.1),
      rotate: degrees(-12),
      opacity: 0.55,
    });
  }
  if (variant === "handwritten") {
    page.drawText("Note: short by 1 pallet — Em.", {
      x: MARGIN + 40,
      y: 140,
      size: 14,
      font: italic,
      color: rgb(0.12, 0.18, 0.55),
      rotate: degrees(-3),
    });
  }
}

function buildKeywords(variant: InvoiceVariant): string {
  const tags = ["tradeops", "invoice-fixture", variant];
  return tags.join(", ");
}

export async function buildInvoicePdf(spec: InvoiceSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  doc.setTitle(`${spec.supplier} invoice fixture`);
  doc.setSubject(spec.invoiceNumber ?? `invoice without number (${spec.variant})`);
  doc.setAuthor("TradeOps eval fixtures");
  doc.setProducer("tradeops-console");
  doc.setCreator("evals/invoice/fixtures/build.ts");
  doc.setKeywords([buildKeywords(spec.variant)]);
  doc.setCreationDate(PINNED_DATE);
  doc.setModificationDate(PINNED_DATE);

  const pagesNeeded =
    spec.variant === "multipage"
      ? Math.max(1, Math.ceil(spec.lineItems.length / LINE_ITEMS_PER_PAGE))
      : 1;

  for (let p = 0; p < pagesNeeded; p++) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    if (p === 0) {
      y = drawHeader(page, helv, helvBold, spec, y);
    } else {
      page.drawText(`${spec.supplier}  (continued, page ${p + 1})`, {
        x: MARGIN,
        y,
        size: 12,
        font: helvBold,
      });
      y -= 24;
    }
    y = drawLineItemHeader(page, helvBold, y);

    const start = p * LINE_ITEMS_PER_PAGE;
    const end =
      spec.variant === "multipage"
        ? Math.min(spec.lineItems.length, start + LINE_ITEMS_PER_PAGE)
        : spec.lineItems.length;

    for (let i = start; i < end; i++) {
      const item = spec.lineItems[i];
      if (!item) continue;
      y = drawLineItem(page, helv, item, spec.currency, y);
    }

    applyVariantOverlay(page, helv, timesItalic, spec.variant);

    if (p === pagesNeeded - 1) {
      const total = spec.lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
      y -= 12;
      page.drawText(`Total: ${fmtMoney(total, spec.currency)}`, {
        x: MARGIN + 340,
        y,
        size: 12,
        font: helvBold,
      });
    }
  }

  return doc.save({ useObjectStreams: false });
}

const SAMPLE_LINE_ITEMS: InvoiceLineItem[] = [
  {
    description: "Industrial Grade HDPE Pellets",
    hsCode: "3901.20",
    quantity: 5000,
    unit: "kg",
    unitPrice: 1.25,
    lineTotal: 6250.0,
  },
  {
    description: "Polymer Additive Masterbatch",
    hsCode: "3812.39",
    quantity: 500,
    unit: "kg",
    unitPrice: 4.8,
    lineTotal: 2400.0,
  },
  {
    description: "PP Woven Bags",
    hsCode: "6305.33",
    quantity: 200,
    unit: "units",
    unitPrice: 0.85,
    lineTotal: 170.0,
  },
];

const BASE_SPEC: InvoiceSpec = {
  supplier: "Singapore Trade Supplies Pte Ltd",
  supplierAddress: "10 Tuas South Ave 2, Singapore 637205",
  buyer: "Pacific Rim Importers Pty Ltd",
  invoiceNumber: "STS-2024-00891",
  invoiceDate: "2024-01-15",
  currency: "USD",
  lineItems: SAMPLE_LINE_ITEMS,
  variant: "clean",
};

export const FIXTURE_SPECS: readonly FixtureSpec[] = [
  { name: "01-clean", spec: { ...BASE_SPEC, variant: "clean" } },
  {
    name: "02-partial",
    spec: {
      ...BASE_SPEC,
      invoiceNumber: undefined,
      lineItems: SAMPLE_LINE_ITEMS.slice(0, 2),
      variant: "partial",
    },
  },
  { name: "03-stamped", spec: { ...BASE_SPEC, variant: "stamped" } },
  { name: "04-handwritten", spec: { ...BASE_SPEC, variant: "handwritten" } },
  {
    name: "05-multipage",
    spec: {
      ...BASE_SPEC,
      variant: "multipage",
      lineItems: Array.from({ length: 18 }, (_, i) => ({
        description: `Container Item ${String(i + 1).padStart(2, "0")}`,
        hsCode: "9999.99",
        quantity: (i + 1) * 10,
        unit: "kg",
        unitPrice: 1 + i * 0.25,
        lineTotal: Number(((i + 1) * 10 * (1 + i * 0.25)).toFixed(2)),
      })),
    },
  },
];

export async function buildAllFixtures(): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const { name, spec } of FIXTURE_SPECS) {
    out.set(name, await buildInvoicePdf(spec));
  }
  return out;
}

function fixturesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here);
}

async function writeAll(): Promise<void> {
  const dir = fixturesDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const map = await buildAllFixtures();
  for (const [name, bytes] of map) {
    const path = resolve(dir, `${name}.pdf`);
    writeFileSync(path, bytes);
    process.stdout.write(`  wrote ${path} (${bytes.length} bytes)\n`);
  }
}

async function checkAll(): Promise<void> {
  const dir = fixturesDir();
  const map = await buildAllFixtures();
  let drift = false;
  for (const [name, bytes] of map) {
    const path = resolve(dir, `${name}.pdf`);
    if (!existsSync(path)) {
      process.stderr.write(`  MISSING ${path}\n`);
      drift = true;
      continue;
    }
    const onDisk = readFileSync(path);
    if (!Buffer.from(bytes).equals(onDisk)) {
      process.stderr.write(`  DRIFT ${path}\n`);
      drift = true;
    } else {
      process.stdout.write(`  OK ${path}\n`);
    }
  }
  if (drift) process.exit(1);
}

async function main(): Promise<void> {
  // Accept --check at any argv position so the flag works both as
  // `tsx build.ts --check` and `pnpm fixtures:invoice -- --check`
  // (pnpm forwards a literal "--" separator before extra args).
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    await checkAll();
    return;
  }
  await writeAll();
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  /fixtures[\\/]build\.(ts|js|mjs)$/.test(process.argv[1]);

if (invokedAsScript) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `[fixtures] ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  });
}
