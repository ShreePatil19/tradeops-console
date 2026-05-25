"use client";

import { useState } from "react";
import { Loader2, MessageSquare, Copy, Check } from "lucide-react";
import type { UIMessage } from "ai";

import { ToolCallCard, type ToolCallPart } from "./tool-call-card";

type StreamOutputProps = {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  error?: Error;
  emptyState?: string;
  traceId?: string;
};

function isToolPart(type: string): boolean {
  return type.startsWith("tool-") || type === "dynamic-tool";
}

export function StreamOutput({
  messages,
  status,
  error,
  emptyState = "Submit input to start the agent.",
  traceId,
}: StreamOutputProps) {
  const [copied, setCopied] = useState(false);

  function copyTraceId() {
    if (!traceId) return;
    navigator.clipboard.writeText(traceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      /* clipboard access denied; silently ignore */
    });
  }
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  if (assistantMessages.length === 0 && status === "ready") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <MessageSquare className="size-5" />
        </div>
        <p className="text-sm">{emptyState}</p>
      </div>
    );
  }

  if (assistantMessages.length === 0 && (status === "submitted" || status === "streaming")) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p className="text-sm">Working...</p>
      </div>
    );
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
      {(status === "submitted" || status === "streaming") && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{status === "streaming" ? "Streaming" : "Working"}...</span>
        </div>
      )}
      {error && (
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
      )}
    </div>
  );
}
