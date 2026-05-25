// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { QuotaIndicator } from "@/components/agents/quota-indicator";

const RESET_EPOCH_S = Math.floor((Date.now() + 6 * 60 * 60 * 1000) / 1000);

function mockBudgetResponse(used: number, cap = 200) {
  return {
    ok: true,
    json: async () => ({ used, cap, resetAt: RESET_EPOCH_S }),
  } as Response;
}

describe("QuotaIndicator", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the loading skeleton on first paint", () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {
        /* never resolves */
      })
    );
    render(<QuotaIndicator />);
    expect(screen.getByLabelText("Loading quota")).toBeInTheDocument();
  });

  it("renders the used/cap pill after a successful fetch", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockBudgetResponse(47, 200)
    );
    render(<QuotaIndicator />);
    await waitFor(() => {
      expect(screen.getByText("47 / 200 today")).toBeInTheDocument();
    });
  });

  it("uses green styling under 50% usage", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockBudgetResponse(40, 200)
    );
    const { container } = render(<QuotaIndicator />);
    await waitFor(() => {
      const pill = container.querySelector("span[title^='Resets at']");
      expect(pill).not.toBeNull();
      expect(pill?.className).toMatch(/green/);
    });
  });

  it("uses amber styling between 50% and 90%", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockBudgetResponse(150, 200)
    );
    const { container } = render(<QuotaIndicator />);
    await waitFor(() => {
      const pill = container.querySelector("span[title^='Resets at']");
      expect(pill).not.toBeNull();
      expect(pill?.className).toMatch(/amber/);
    });
  });

  it("uses red styling at or above 90%", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockBudgetResponse(190, 200)
    );
    const { container } = render(<QuotaIndicator />);
    await waitFor(() => {
      const pill = container.querySelector("span[title^='Resets at']");
      expect(pill).not.toBeNull();
      expect(pill?.className).toMatch(/red/);
    });
  });

  it("shows a dash on fetch error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);
    render(<QuotaIndicator />);
    await waitFor(() => {
      expect(screen.getByLabelText("Quota unavailable")).toBeInTheDocument();
    });
  });

  it("shows the reset time in the tooltip", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockBudgetResponse(10, 200)
    );
    const { container } = render(<QuotaIndicator />);
    await waitFor(() => {
      const pill = container.querySelector("span[title^='Resets at']");
      expect(pill).not.toBeNull();
      expect(pill?.getAttribute("title")).toMatch(/^Resets at /);
    });
  });
});
