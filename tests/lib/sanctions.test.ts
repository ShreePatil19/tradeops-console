import { describe, it, expect } from "vitest";
import { checkSanctions, sanctionsList } from "@/lib/sanctions";

describe("sanctionsList", () => {
  it("contains at least one entry per supported list source", () => {
    const sources = new Set(sanctionsList.map((e) => e.list));
    expect(sources.has("OFAC SDN")).toBe(true);
    expect(sources.has("DFAT")).toBe(true);
    expect(sources.has("UN")).toBe(true);
  });

  it("every entry has a non-empty name, reason, and addedAt", () => {
    for (const entry of sanctionsList) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every entry has aliases as an array (possibly empty)", () => {
    for (const entry of sanctionsList) {
      expect(Array.isArray(entry.aliases)).toBe(true);
    }
  });
});

describe("checkSanctions", () => {
  it("returns matched=false and empty entries for an empty query", () => {
    const r = checkSanctions("");
    expect(r.matched).toBe(false);
    expect(r.entries).toEqual([]);
  });

  it("returns matched=false and empty entries for a whitespace-only query", () => {
    const r = checkSanctions("   ");
    expect(r.matched).toBe(false);
    expect(r.entries).toEqual([]);
  });

  it("returns matched=true for an exact name match", () => {
    const r = checkSanctions("Sovcomflot PJSC");
    expect(r.matched).toBe(true);
    expect(r.entries.length).toBeGreaterThan(0);
    expect(r.entries[0].name).toBe("Sovcomflot PJSC");
  });

  it("is case-insensitive on name matches", () => {
    const lower = checkSanctions("sovcomflot pjsc");
    const upper = checkSanctions("SOVCOMFLOT PJSC");
    expect(lower.matched).toBe(true);
    expect(upper.matched).toBe(true);
    expect(lower.entries[0].name).toBe(upper.entries[0].name);
  });

  it("matches on an alias", () => {
    const r = checkSanctions("KOMID");
    expect(r.matched).toBe(true);
    const koreaEntry = r.entries.find(
      (e) => e.name === "Korea Mining Development Trading Corporation"
    );
    expect(koreaEntry).toBeDefined();
    expect(koreaEntry?.matchedOn).toBe("KOMID");
  });

  it("matches on a substring of the canonical name", () => {
    const r = checkSanctions("Wagner");
    expect(r.matched).toBe(true);
    const entry = r.entries.find((e) => e.name === "Wagner Group");
    expect(entry).toBeDefined();
  });

  it("returns matched=false for a name that does not appear in the register", () => {
    const r = checkSanctions("Generic Clear Counterparty 12345");
    expect(r.matched).toBe(false);
    expect(r.entries).toEqual([]);
  });

  it("returns matchedOn for each matched entry pointing at the alias or name that matched", () => {
    const r = checkSanctions("Hezbollah");
    expect(r.matched).toBe(true);
    expect(r.entries[0].matchedOn).toBe("Hezbollah");
  });

  it("dedupes matches per entry (does not double-count when multiple aliases overlap the query)", () => {
    const r = checkSanctions("Sovcomflot");
    expect(r.matched).toBe(true);
    const sovcomflotEntries = r.entries.filter((e) => e.name === "Sovcomflot PJSC");
    expect(sovcomflotEntries.length).toBe(1);
  });
});
