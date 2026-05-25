// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import type { UIMessage } from "ai";

import { StreamOutput } from "@/components/agents/stream-output";

function makeAssistantMessage(text: string): UIMessage {
  return {
    id: "asst-1",
    role: "assistant",
    parts: [{ type: "text", text }],
  } as UIMessage;
}

describe("StreamOutput", () => {
  describe("empty state", () => {
    it("renders the EmptyState component when emptyStateProps provided", () => {
      render(
        <StreamOutput
          messages={[]}
          status="ready"
          emptyStateProps={{
            icon: <BookOpen className="size-6" />,
            title: "Ask a trade question",
            description: "Submit input to start the agent.",
            cta: "Try a sample on the left.",
          }}
        />
      );
      expect(screen.getByText("Ask a trade question")).toBeInTheDocument();
      expect(screen.getByText("Try a sample on the left.")).toBeInTheDocument();
    });

    it("falls back to the emptyState string prop", () => {
      render(
        <StreamOutput
          messages={[]}
          status="ready"
          emptyState="No data yet"
        />
      );
      expect(screen.getByText("No data yet")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("renders the loading skeleton when status is submitted with no messages", () => {
      render(<StreamOutput messages={[]} status="submitted" />);
      expect(screen.getByLabelText("Loading response")).toBeInTheDocument();
    });
  });

  describe("structured error cards", () => {
    it("renders RateLimitCard for rate_limited error", () => {
      const error = new Error(
        JSON.stringify({ error: "rate_limited", retryAfter: Date.now() + 30_000 })
      );
      render(<StreamOutput messages={[]} status="error" error={error} />);
      expect(screen.getByText(/Rate limit reached/i)).toBeInTheDocument();
    });

    it("renders BudgetExhaustedCard for global_budget_exhausted error", () => {
      const error = new Error(
        JSON.stringify({
          error: "global_budget_exhausted",
          resetAt: Date.now() + 6 * 3600 * 1000,
        })
      );
      render(<StreamOutput messages={[]} status="error" error={error} />);
      expect(screen.getByText(/quota is reached/i)).toBeInTheDocument();
    });

    it("renders BlockedCard for blocked error", () => {
      const error = new Error(
        JSON.stringify({ error: "blocked", reason: "injection_attempt" })
      );
      render(<StreamOutput messages={[]} status="error" error={error} />);
      expect(screen.getByText(/blocked by safety filter/i)).toBeInTheDocument();
    });

    it("renders BlockedCard without revealing the injection reason", () => {
      const error = new Error(
        JSON.stringify({ error: "blocked", reason: "injection_attempt" })
      );
      render(<StreamOutput messages={[]} status="error" error={error} />);
      expect(screen.queryByText(/injection_attempt/i)).not.toBeInTheDocument();
    });

    it("renders PayloadTooLargeCard for payload_too_large error", () => {
      const error = new Error(
        JSON.stringify({
          error: "payload_too_large",
          maxBytes: 4096,
          gotBytes: 8192,
        })
      );
      render(<StreamOutput messages={[]} status="error" error={error} />);
      expect(screen.getByText(/Input too large/i)).toBeInTheDocument();
      expect(screen.getByText(/8,192 bytes received/i)).toBeInTheDocument();
      expect(screen.getByText(/maximum is 4,096 bytes/i)).toBeInTheDocument();
    });
  });

  describe("generic error fallback", () => {
    it("renders the GenericErrorCard for non-JSON error messages", () => {
      const error = new Error("Something blew up");
      render(<StreamOutput messages={[]} status="error" error={error} />);
      expect(screen.getByText("Something blew up")).toBeInTheDocument();
    });

    it("shows trace_id with a copy button when provided", () => {
      const error = new Error("Boom");
      render(
        <StreamOutput
          messages={[]}
          status="error"
          error={error}
          traceId="abc-123-trace"
        />
      );
      expect(screen.getByText(/trace: abc-123-trace/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /copy trace id/i })).toBeInTheDocument();
    });

    it("does not show trace_id row when not provided", () => {
      const error = new Error("Boom");
      render(<StreamOutput messages={[]} status="error" error={error} />);
      expect(screen.queryByRole("button", { name: /copy trace id/i })).not.toBeInTheDocument();
    });
  });

  describe("assistant message rendering", () => {
    it("renders text parts from assistant messages", () => {
      const msg = makeAssistantMessage("Hello from the agent");
      render(<StreamOutput messages={[msg]} status="ready" />);
      expect(screen.getByText("Hello from the agent")).toBeInTheDocument();
    });

    it("does not render user messages", () => {
      const userMsg: UIMessage = {
        id: "u-1",
        role: "user",
        parts: [{ type: "text", text: "What is FOB?" }],
      } as UIMessage;
      render(<StreamOutput messages={[userMsg]} status="ready" />);
      expect(screen.queryByText("What is FOB?")).not.toBeInTheDocument();
    });
  });
});
