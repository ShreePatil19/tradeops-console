"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { X } from "lucide-react";

import { Mail } from "lucide-react";

import { AgentShell } from "@/components/agents/agent-shell";
import { StreamOutput } from "@/components/agents/stream-output";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_CAPS } from "@/lib/guards";

const SAMPLES: Record<string, string> = {
  rfq: `Subject: Pricing for 40HC reefer Sydney to Singapore

Hi team,

We have weekly volume of 6 x 40' reefer (chilled, 2C) ex Port Botany to PSA Singapore, starting first week of July. Can you send your all-in rate including BAF/CAF, and confirm equipment availability for the next 8 weeks?

We need a response by Thursday to lock the program with our customer.

Thanks,
Sarah Lim
Vantage Foods Pty Ltd`,
  complaint: `Hi,

The shipment under BL SCAU8842197 arrived at Brisbane on Tuesday and three cartons are visibly damaged. Pictures attached. The invoice value of the affected cartons is AUD 4,820. We need a credit note issued before we can sign the POD. Please escalate.

Regards,
Mike`,
  spam: `Hello,

I am a representative of a private investment fund based in West Africa. We are seeking trustworthy partners to assist with the transfer of USD 12.5M to your country. You will receive 30% of the funds as commission.

Please reply urgently with your bank details to proceed.`,
};

function InboxTriager() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agents/inbox" }),
  });

  const busy = status === "submitted" || status === "streaming" || submitting;

  async function handleSubmit() {
    if (!email.trim() || busy) return;
    setSubmitting(true);
    try {
      await sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: `Triage this email:\n\n${email.trim()}`,
          },
        ],
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setEmail("");
    setMessages([]);
  }

  function loadSample(key: keyof typeof SAMPLES) {
    setEmail(SAMPLES[key]);
    setMessages([]);
  }

  return (
    <AgentShell
      title="Inbox Triager"
      description="Paste an email. The agent classifies it (RFQ, order, complaint, spam, info), drafts a reply when appropriate, and gives the desk a one-line next action."
      input={
        <>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="email-body" className="text-sm font-medium">
              Email body
            </label>
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => loadSample("rfq")}
                disabled={busy}
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
              >
                sample RFQ
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => loadSample("complaint")}
                disabled={busy}
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
              >
                complaint
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => loadSample("spam")}
                disabled={busy}
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
              >
                spam
              </button>
            </div>
          </div>
          <Textarea
            id="email-body"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            placeholder="Paste the full email here, including the subject line if available..."
            className="min-h-[260px]"
            maxLength={INPUT_CAPS.inbox.maxBytes}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!email.trim() || busy}
              className="flex-1"
            >
              {busy ? "Triaging..." : "Triage email"}
            </Button>
            {(email || messages.length > 0) && (
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
        </>
      }
      output={
        <StreamOutput
          messages={messages}
          status={status}
          error={error ?? undefined}
          emptyStateProps={{
            icon: <Mail className="size-6" />,
            title: "Waiting for an email",
            description:
              "Paste or load a sample email on the left. The classification, priority, and drafted reply will stream here.",
            cta: "Load a sample RFQ, complaint, or spam message.",
          }}
        />
      }
    />
  );
}

export default function Page() {
  return <InboxTriager />;
}
