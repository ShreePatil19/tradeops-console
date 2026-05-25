"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Copy, Check } from "lucide-react";
import type { UIMessage } from "ai";

import { ToolCallCard, type ToolCallPart } from "./tool-call-card";
import { EmptyState, type EmptyStateProps } from "./empty-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StreamOutputProps = {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  error?: Error;
  /** Simple string fallback for the empty state (kept for backward compat). */
  emptyState?: string;
  /** Rich empty state. Takes precedence over `emptyState` string. */
  emptyStateProps?: EmptyStateProps;
  traceId?: string;
};

// Structured error payloads the backend may return in error.message as JSON.
type RateLimitedPayload = {
  error: "rate_limited";
  retryAfter: number; // epoch ms
};
type BudgetExhaustedPayload = {
  error: "global_budget_exhausted";
  resetAt: number; // epoch ms
};
type BlockedPayload = {
  error: "blocked";
  reason: string;
};
type PayloadTooLargePayload = {
  error: "payload_too_large";
  maxBytes: number;
  gotBytes: number;
};

type StructuredError =
  | RateLimitedPayload
  | BudgetExhaustedPayload
  | BlockedPayload
  | PayloadTooLargePayload;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isToolPart(type: string): boolean {
  return type.startsWith("tool-") || type === "dynamic-tool";
}

function parseStructuredError(message: string): StructuredError | null {
  try {
    const parsed: unknown = JSON.parse(message);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof (parsed as Record<string, unknown>).error === "string"
    ) {
      return parsed as StructuredError;
    }
    return null;
  } catch {
    return null;
  }
}

function formatLocalTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Countdown hook
// ---------------------------------------------------------------------------

function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((targetMs - Date.now()) / 1000))
  );
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function tick() {
      const secs = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
      setRemaining(secs);
      if (secs > 0) {
        rafRef.current = setTimeout(tick, 1000);
      }
    }
    tick();
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [targetMs]);

  return remaining;
}

// ---------------------------------------------------------------------------
// Error cards
// ---------------------------------------------------------------------------

function RateLimitCard({ payload }: { payload: RateLimitedPayload }) {
  const remaining = useCountdown(payload.retryAfter);
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
      <p className="font-medium text-amber-700 dark:text-amber-400">Rate limit reached</p>
      <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80">
        {remaining > 0
          ? `Please wait ${remaining}s before trying again.`
          : "You can retry now."}
      </p>
    </div>
  );
}

function BudgetExhaustedCard({ payload }: { payload: BudgetExhaustedPayload }) {
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-3 text-sm">
      <p className="font-medium text-red-700 dark:text-red-400">
        Today&apos;s demo quota is reached.
      </p>
      <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">
        Resets at {formatLocalTime(payload.resetAt)}.
      </p>
    </div>
  );
}

function BlockedCard() {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-3 text-sm text-destructive">
      <p className="font-medium">Request blocked by safety filter.</p>
    </div>
  );
}

function PayloadTooLargeCard({ payload }: { payload: PayloadTooLargePayload }) {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-3 text-sm text-destructive">
      <p className="font-medium">Input too large.</p>
      <p className="mt-1 text-xs text-destructive/80">
        {payload.gotBytes.toLocaleString()} bytes received, maximum is{" "}
        {payload.maxBytes.toLocaleString()} bytes.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (#53)
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div aria-label="Loading response" className="flex flex-1 flex-col gap-3 animate-pulse px-1 pt-2">
      <div className="h-3 w-3/4 rounded-full bg-muted" />
      <div className="h-3 w-full rounded-full bg-muted" />
      <div className="h-3 w-5/6 rounded-full bg-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic error with trace ID (existing behaviour, kept as fallback)
// ---------------------------------------------------------------------------

function GenericErrorCard({
  error,
  traceId,
}: {
  error: Error;
  traceId?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copyTraceId() {
    if (!traceId) return;
    navigator.clipboard
      .writeText(traceId)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard access denied; silently ignore */
      });
  }

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <p>{error.message}</p>
      {traceId && (
        <div className="mt-2 flex items-center gap-2 font-mono text-xs text-destructive/70">
          <span>trace: {traceId}</span>
          <button
            type="button"
            onClick={copyTraceId}
            className="inline-flex items-center gap-1 rounded border border-destructive/30 px-1.5 py-0.5 hover:bg-destructive/10"
            aria-label="Copy trace ID"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            <span>{copied ? "Copied" : "Copy trace ID"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structured error dispatcher
// ---------------------------------------------------------------------------

function ErrorDisplay({ error, traceId }: { error: Error; traceId?: string }) {
  const structured = parseStructuredError(error.message);

  if (structured) {
    if (structured.error === "rate_limited") {
      return <RateLimitCard payload={structured} />;
    }
    if (structured.error === "global_budget_exhausted") {
      return <BudgetExhaustedCard payload={structured} />;
    }
    if (structured.error === "blocked") {
      return <BlockedCard />;
    }
    if (structured.error === "payload_too_large") {
      return <PayloadTooLargeCard payload={structured} />;
    }
  }

  return <GenericErrorCard error={error} traceId={traceId} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StreamOutput({
  messages,
  status,
  error,
  emptyState = "Submit input to start the agent.",
  emptyStateProps,
  traceId,
}: StreamOutputProps) {
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  // Empty state (no messages, ready)
  if (assistantMessages.length === 0 && status === "ready") {
    if (emptyStateProps) {
      return <EmptyState {...emptyStateProps} />;
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <MessageSquare className="size-5" />
        </div>
        <p className="text-sm">{emptyState}</p>
      </div>
    );
  }

  // Loading skeleton: submitted but no assistant messages yet
  if (assistantMessages.length === 0 && status === "submitted") {
    return <LoadingSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      {assistantMessages.map((message) => (
        <div key={message.id} className="flex flex-col gap-3">
          {message.parts.map((part, idx) => {
            if (part.type === "text") {
              return (
                <p
                  key={idx}
                  className="text-sm leading-relaxed whitespace-pre-wrap text-foreground"
                >
                  {part.text}
                </p>
              );
            }
            if (part.type === "reasoning") {
              return (
                <p
                  key={idx}
                  className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs italic leading-relaxed text-muted-foreground"
                >
                  {part.text}
                </p>
              );
            }
            if (isToolPart(part.type)) {
              return <ToolCallCard key={idx} part={part as ToolCallPart} />;
            }
            return null;
          })}
        </div>
      ))}

      {/* Inline streaming indicator once content is visible */}
      {(status === "submitted" || status === "streaming") && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{status === "streaming" ? "Streaming" : "Working"}...</span>
        </div>
      )}

      {error && <ErrorDisplay error={error} traceId={traceId} />}
    </div>
  );
}
