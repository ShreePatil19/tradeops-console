// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub the QuotaIndicator so AgentShell tests do not need to mock fetch.
vi.mock("@/components/agents/quota-indicator", () => ({
  QuotaIndicator: () => <div data-testid="quota-stub" />,
}));

import { AgentShell } from "@/components/agents/agent-shell";

describe("AgentShell", () => {
  it("renders the title", () => {
    render(
      <AgentShell
        title="Trade Q&A"
        description="Ask a question"
        input={<div>input panel</div>}
        output={<div>output panel</div>}
      />
    );
    expect(screen.getByRole("heading", { level: 1, name: "Trade Q&A" })).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(
      <AgentShell
        title="Trade Q&A"
        description="Ask any question about Incoterms"
        input={<div>input panel</div>}
        output={<div>output panel</div>}
      />
    );
    expect(screen.getByText("Ask any question about Incoterms")).toBeInTheDocument();
  });

  it("renders both the input and output slots", () => {
    render(
      <AgentShell
        title="Agent"
        description="Description"
        input={<div data-testid="input">input slot</div>}
        output={<div data-testid="output">output slot</div>}
      />
    );
    expect(screen.getByTestId("input")).toBeInTheDocument();
    expect(screen.getByTestId("output")).toBeInTheDocument();
  });

  it("renders a back link to the homepage", () => {
    render(
      <AgentShell
        title="Agent"
        description="Description"
        input={<div />}
        output={<div />}
      />
    );
    const backLink = screen.getByRole("link", { name: /TradeOps Console/ });
    expect(backLink).toBeInTheDocument();
    expect(backLink.getAttribute("href")).toBe("/");
  });

  it("renders the QuotaIndicator in the header", () => {
    render(
      <AgentShell
        title="Agent"
        description="Description"
        input={<div />}
        output={<div />}
      />
    );
    expect(screen.getByTestId("quota-stub")).toBeInTheDocument();
  });
});
