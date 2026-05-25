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

describe("QuotaIndicator with agent prop", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mockAgentResponse(opts: {
    used?: number;
    cap?: number;
    perIpUsed: number;
    perIpCap?: number;
    slug: string;
  }) {
    return {
      ok: true,
      json: async () => ({
        used: opts.used ?? 10,
        cap: opts.cap ?? 200,
        resetAt: RESET_EPOCH_S,
        agent: {
          slug: opts.slug,
          perIpUsed: opts.perIpUsed,
          perIpCap: opts.perIpCap ?? 30,
          perIpResetAt: RESET_EPOCH_S,
        },
      }),
    } as Response;
  }

  it("requests /api/budget?agent=<slug> when agent is passed", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      mockAgentResponse({ slug: "qa", perIpUsed: 3 })
    );
    render(<QuotaIndicator agent="qa" />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("agent=qa"))).toBe(true);
  });

  it("renders both global and per-agent pills", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAgentResponse({
        used: 50,
        cap: 200,
        slug: "invoice",
        perIpUsed: 4,
        perIpCap: 30,
      })
    );
    render(<QuotaIndicator agent="invoice" />);
    await waitFor(() => {
      expect(screen.getByText("50 / 200 today")).toBeInTheDocument();
      expect(screen.getByText(/4 \/ 30/)).toBeInTheDocument();
    });
  });

  it("labels the per-agent pill with the agent slug", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAgentResponse({ slug: "inbox", perIpUsed: 2 })
    );
    render(<QuotaIndicator agent="inbox" />);
    await waitFor(() => {
      expect(screen.getByText(/2 \/ 30 inbox/)).toBeInTheDocument();
    });
  });

  it("uses amber styling on the per-agent pill between 50 and 90 percent of the per-IP cap", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAgentResponse({ slug: "qa", perIpUsed: 20, perIpCap: 30 })
    );
    const { container } = render(<QuotaIndicator agent="qa" />);
    await waitFor(() => {
      const agentPill = container.querySelector(
        "span[data-quota-pill='agent']"
      );
      expect(agentPill).not.toBeNull();
      expect(agentPill?.className).toMatch(/amber/);
    });
  });

  it("uses red styling on the per-agent pill at or above 90 percent", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAgentResponse({ slug: "qa", perIpUsed: 28, perIpCap: 30 })
    );
    const { container } = render(<QuotaIndicator agent="qa" />);
    await waitFor(() => {
      const agentPill = container.querySelector(
        "span[data-quota-pill='agent']"
      );
      expect(agentPill).not.toBeNull();
      expect(agentPill?.className).toMatch(/red/);
    });
  });
});
