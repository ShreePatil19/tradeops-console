// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ToolCallCard } from "@/components/agents/tool-call-card";

describe("ToolCallCard", () => {
  it("renders the tool name (stripped of tool- prefix)", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-search_corpus",
          state: "output-available",
          input: { query: "FOB" },
          output: { chunks: [] },
        }}
      />
    );
    expect(screen.getByText("search_corpus")).toBeInTheDocument();
  });

  it("renders 'tool' for dynamic-tool type", () => {
    render(
      <ToolCallCard
        part={{
          type: "dynamic-tool",
          state: "output-available",
          input: {},
        }}
      />
    );
    expect(screen.getByText("tool")).toBeInTheDocument();
  });

  it("shows 'Preparing call' label when state is input-streaming", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-extract_line_items",
          state: "input-streaming",
        }}
      />
    );
    expect(screen.getByText("Preparing call")).toBeInTheDocument();
  });

  it("shows 'Calling' label when state is input-available", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-extract_line_items",
          state: "input-available",
        }}
      />
    );
    expect(screen.getByText("Calling")).toBeInTheDocument();
  });

  it("shows 'Result' label when state is output-available", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-check_sanctions",
          state: "output-available",
          input: { query: "Sovcomflot" },
          output: { matched: true },
        }}
      />
    );
    expect(screen.getByText("Result")).toBeInTheDocument();
  });

  it("shows 'Error' label when state is output-error", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-check_sanctions",
          state: "output-error",
          errorText: "service unreachable",
        }}
      />
    );
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("service unreachable")).toBeInTheDocument();
  });

  it("renders Input block when input is present", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-classify_email",
          state: "output-available",
          input: { category: "rfq" },
          output: { recorded: true },
        }}
      />
    );
    expect(screen.getByText("Input")).toBeInTheDocument();
  });

  it("renders Output block when output is present", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-classify_email",
          state: "output-available",
          input: { category: "rfq" },
          output: { recorded: true },
        }}
      />
    );
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  it("does not render Input block when input is undefined", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-search_corpus",
          state: "input-streaming",
        }}
      />
    );
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
  });

  it("renders JSON-stringified objects with newlines preserved", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-search_corpus",
          state: "output-available",
          input: { query: "FOB shipment" },
          output: { matchCount: 2 },
        }}
      />
    );
    const inputPre = screen.getByText(/query/);
    expect(inputPre.tagName).toBe("PRE");
  });
});
