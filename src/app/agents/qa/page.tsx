"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { X } from "lucide-react";

import { BookOpen } from "lucide-react";

import { AgentShell } from "@/components/agents/agent-shell";
import { StreamOutput } from "@/components/agents/stream-output";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_CAPS } from "@/lib/guards";

const SAMPLES = [
  "What's the difference between FOB and FCA for a container shipment?",
  "When does GST apply to goods imported into Australia, and at what value threshold?",
  "Under CIF, who pays for insurance and what cover is required?",
  "What is a Tariff Concession Order and when can I apply for one?",
];

function TradeQA() {
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agents/qa" }),
  });

  const busy = status === "submitted" || status === "streaming" || submitting;

  async function handleSubmit() {
    if (!question.trim() || busy) return;
    setSubmitting(true);
    try {
      await sendMessage({
        role: "user",
        parts: [{ type: "text", text: question.trim() }],
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setQuestion("");
    setMessages([]);
  }

  return (
    <AgentShell
      agent="qa"
      title="Trade Q&A"
      description="Ask a question about Australian customs or ICC Incoterms 2020. The agent searches a small in-repo knowledge base and answers with inline citations to the chunk IDs it used."
      input={
        <>
          <label htmlFor="question" className="text-sm font-medium">
            Your question
          </label>
          <Textarea
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy}
            placeholder="e.g., What's the difference between FOB and FCA for containers?"
            className="min-h-[120px]"
            maxLength={INPUT_CAPS.qa.maxBytes}
          />
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground">try one of these:</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setQuestion(sample);
                  setMessages([]);
                }}
                disabled={busy}
                className="text-left text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                {sample}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!question.trim() || busy}
              className="flex-1"
            >
              {busy ? "Answering..." : "Ask"}
            </Button>
            {(question || messages.length > 0) && (
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
            The knowledge base is small (10 chunks covering Incoterms 2020 and
            AU customs basics). Questions outside this scope will be flagged as
            out of scope rather than guessed.
          </p>
        </>
      }
      output={
        <StreamOutput
          messages={messages}
          status={status}
          error={error ?? undefined}
          emptyStateProps={{
            icon: <BookOpen className="size-6" />,
            title: "Ask a trade question",
            description:
              "Ask a question about Australian customs or ICC Incoterms 2020 to see streaming citations from the knowledge base.",
            cta: "Try a sample question on the left.",
          }}
        />
      }
    />
  );
}

export default function Page() {
  return <TradeQA />;
}
