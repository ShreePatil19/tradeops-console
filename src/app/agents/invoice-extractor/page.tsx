"use client";

import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FileText, Upload, X } from "lucide-react";

import { AgentShell } from "@/components/agents/agent-shell";
import { StreamOutput } from "@/components/agents/stream-output";
import { Button } from "@/components/ui/button";
import { INPUT_CAPS } from "@/lib/guards";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function InvoiceExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agents/invoice" }),
  });

  const busy = status === "submitted" || status === "streaming" || submitting;

  async function handleSubmit() {
    if (!file || busy) return;
    if (file.size > INPUT_CAPS.invoice.maxBytes) {
      setFileSizeError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed is ${INPUT_CAPS.invoice.maxBytes / 1024 / 1024} MB.`
      );
      return;
    }
    setFileSizeError(null);
    setSubmitting(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: "Extract the line items from this supplier invoice. Use the extract_line_items tool.",
          },
          {
            type: "file",
            mediaType: "application/pdf",
            url: dataUrl,
            filename: file.name,
          },
        ],
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setFile(null);
    setFileSizeError(null);
    if (inputRef.current) inputRef.current.value = "";
    setMessages([]);
  }

  return (
    <AgentShell
      title="Invoice Extractor"
      description="Drop a supplier PDF. The vision model reads each line item, returns structured JSON, and flags anything that looks off."
      input={
        <>
          <label
            htmlFor="invoice-file"
            className="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors hover:border-foreground/30 hover:bg-muted/50"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              {file ? <FileText className="size-5" /> : <Upload className="size-5" />}
            </div>
            {file ? (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · click to replace
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium text-foreground">
                  Click to upload a PDF invoice
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF only, up to ~10 MB
                </p>
              </div>
            )}
            <input
              ref={inputRef}
              id="invoice-file"
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {fileSizeError && (
            <p className="text-sm text-destructive" role="alert">
              {fileSizeError}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!file || busy}
              className="flex-1"
            >
              {busy ? "Extracting..." : "Extract line items"}
            </Button>
            {(file || messages.length > 0) && (
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

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">What gets extracted</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Supplier, invoice number, date, currency (ISO).</li>
              <li>Per row: description, quantity, unit price, total, confidence (0 to 1).</li>
              <li>Grand total + anomaly notes for an ops analyst.</li>
            </ul>
          </details>
        </>
      }
      output={
        <StreamOutput
          messages={messages}
          status={status}
          error={error ?? undefined}
          emptyState="Upload a supplier PDF and the extracted line items will stream here."
        />
      }
    />
  );
}

export default function Page() {
  return <InvoiceExtractor />;
}
