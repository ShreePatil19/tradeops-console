import { describe, it, expect } from "vitest";
import {
  parseEnvFile,
  buildCommandPlan,
  DEFAULT_TARGET_ENVS,
  type EnvVarPlan,
} from "../../scripts/vercel-env-sync";

describe("parseEnvFile", () => {
  it("parses simple KEY=VALUE lines into a map", () => {
    const out = parseEnvFile("FOO=bar\nBAZ=qux\n");
    expect(out.get("FOO")).toBe("bar");
    expect(out.get("BAZ")).toBe("qux");
    expect(out.size).toBe(2);
  });

  it("skips comment lines starting with #", () => {
    const out = parseEnvFile("# a comment\nFOO=bar\n#another\n");
    expect(out.size).toBe(1);
    expect(out.get("FOO")).toBe("bar");
  });

  it("skips blank lines and lines with only whitespace", () => {
    const out = parseEnvFile("\n   \nFOO=bar\n\n");
    expect(out.size).toBe(1);
  });

  it("strips surrounding double quotes from values", () => {
    const out = parseEnvFile('FOO="some value"\n');
    expect(out.get("FOO")).toBe("some value");
  });

  it("strips surrounding single quotes from values", () => {
    const out = parseEnvFile("FOO='single quoted'\n");
    expect(out.get("FOO")).toBe("single quoted");
  });

  it("preserves the equals signs inside a value", () => {
    const out = parseEnvFile("URL=https://example.com/?a=1&b=2\n");
    expect(out.get("URL")).toBe("https://example.com/?a=1&b=2");
  });

  it("trims whitespace around the key but not inside an unquoted value's middle", () => {
    const out = parseEnvFile("  FOO  =bar baz\n");
    expect(out.has("FOO")).toBe(true);
    expect(out.get("FOO")).toBe("bar baz");
  });

  it("ignores malformed lines without an equals sign", () => {
    const out = parseEnvFile("FOO=bar\nNOT_KV_LINE\nBAZ=qux\n");
    expect(out.size).toBe(2);
    expect(out.has("NOT_KV_LINE")).toBe(false);
  });

  it("returns the last value when the same key appears twice", () => {
    const out = parseEnvFile("FOO=first\nFOO=second\n");
    expect(out.get("FOO")).toBe("second");
  });
});

describe("buildCommandPlan", () => {
  it("returns one plan entry per (key, env) pair across the default 3 environments", () => {
    const vars = new Map([["FOO", "bar"]]);
    const plan = buildCommandPlan(vars, DEFAULT_TARGET_ENVS);
    expect(plan).toHaveLength(3);
    const envs = plan.map((p: EnvVarPlan) => p.env).sort();
    expect(envs).toEqual(["development", "preview", "production"]);
    for (const p of plan) {
      expect(p.name).toBe("FOO");
      expect(p.value).toBe("bar");
    }
  });

  it("produces command strings of the form 'vercel env add NAME ENV'", () => {
    const vars = new Map([["FOO", "bar"]]);
    const plan = buildCommandPlan(vars, ["production"]);
    expect(plan[0]?.command).toBe("vercel env add FOO production");
  });

  it("filters to a single target environment when supplied", () => {
    const vars = new Map([
      ["FOO", "1"],
      ["BAR", "2"],
    ]);
    const plan = buildCommandPlan(vars, ["preview"]);
    expect(plan).toHaveLength(2);
    expect(plan.every((p) => p.env === "preview")).toBe(true);
  });

  it("returns an empty plan for an empty var map", () => {
    const plan = buildCommandPlan(new Map(), DEFAULT_TARGET_ENVS);
    expect(plan).toEqual([]);
  });

  it("returns plans in stable order: each key fans out across all envs before the next key", () => {
    const vars = new Map([
      ["A", "1"],
      ["B", "2"],
    ]);
    const plan = buildCommandPlan(vars, DEFAULT_TARGET_ENVS);
    expect(plan.map((p) => `${p.name}:${p.env}`)).toEqual([
      "A:development",
      "A:preview",
      "A:production",
      "B:development",
      "B:preview",
      "B:production",
    ]);
  });

  it("rejects invalid env names that are not development/preview/production", () => {
    expect(() => buildCommandPlan(new Map([["X", "1"]]), ["staging"])).toThrow(
      /staging/
    );
  });
});
