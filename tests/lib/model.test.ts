import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MODEL_ID, requireApiKey } from "@/lib/model";

const ENV_KEY = "GOOGLE_GENERATIVE_AI_API_KEY";

describe("MODEL_ID", () => {
  it("is the current Gemini Flash model", () => {
    expect(MODEL_ID).toBe("gemini-2.5-flash");
  });
});

describe("requireApiKey", () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalValue;
    }
  });

  it("throws when the env var is unset", () => {
    delete process.env[ENV_KEY];
    expect(() => requireApiKey()).toThrowError(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it("throws when the env var is empty string", () => {
    process.env[ENV_KEY] = "";
    expect(() => requireApiKey()).toThrowError(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it("does not throw when the env var is set to a non-empty string", () => {
    process.env[ENV_KEY] = "AIza-fake-test-key";
    expect(() => requireApiKey()).not.toThrow();
  });

  it("error message includes the aistudio URL hint", () => {
    delete process.env[ENV_KEY];
    let caught: unknown = null;
    try {
      requireApiKey();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/aistudio\.google\.com\/apikey/);
  });

  it("error message names both .env.local and Vercel env vars", () => {
    delete process.env[ENV_KEY];
    try {
      requireApiKey();
      throw new Error("requireApiKey should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/\.env\.local/);
      expect(msg).toMatch(/Vercel/);
    }
  });
});
