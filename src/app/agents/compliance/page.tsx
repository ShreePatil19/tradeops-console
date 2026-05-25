"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { X } from "lucide-react";

import { AgentShell } from "@/components/agents/agent-shell";
import { StreamOutput } from "@/components/agents/stream-output";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SAMPLES = [
  "Vantage Foods Pty Ltd",
  "Sovcomflot PJSC",
  "Wagner Group",
  "Acme Trading Co",
];

function CompliancePreCheck() {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agents/compliance" }),
  });

  const busy = status === "submitted" || status === "streaming" || submitting;

  async function handleSubmit() {
    if (!name.trim() || busy) return;
    setSubmitting(true);
    try {
      await sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: `Run a sanctions pre-check on this counterparty: ${name.trim()}`,
          },
        ],
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setName("");
    setMessages([]);
  }

  return (
    <AgentShell
      title="Compliance Pre-Check"
      description="Enter a counterparty name. The agent searches a stub sanctions register, then returns a verdict (clear, hit, or inconclusive) with cited reasoning."
      input={
        <>
          <label htmlFor="counterparty" className="text-sm font-medium">
            Counterparty name
          </label>
          <Input
            id="counterparty"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g., Sovcomflot PJSC"
            className="h-10"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="flex flex-wrap gap-1 text-xs">
            <span className="text-muted-foreground">try:</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setName(sample);
                  setMessages([]);
                }}
                disabled={busy}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                {sample}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || busy}
              className="flex-1"
            >
              {busy ? "Screening..." : "Run pre-check"}
            </Button>
            {(name || messages.length > 0) && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleReset}
                disabled={busy}
                aria-label="Reset"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">Pre-check only.</strong>{" "}
            The internal register is a small curated stub for demo purposes. A
            full Refinitiv World-Check or Dow Jones Risk & Compliance screening
            is still required before transacting.
          </p>
        </>
      }
      output={
        <StreamOutput
          messages={messages}
          status={status}
          error={error ?? undefined}
          emptyState="Enter a counterparty name to see the screening result and verdict stream here."
        />
      }
    />
  );
}

export default function Page() {
  return <CompliancePreCheck />;
}
