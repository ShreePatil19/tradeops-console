"use client";

import { Loader2, Wrench, CheckCircle2, AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type ToolCallState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export type ToolCallPart = {
  type: string;
  toolCallId?: string;
  state?: ToolCallState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function toolNameFromType(type: string): string {
  if (type.startsWith("tool-")) return type.slice(5);
  if (type === "dynamic-tool") return "tool";
  return type;
}

function StatusIcon({ state }: { state?: ToolCallState }) {
  if (state === "output-available") {
    return <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
  }
  if (state === "output-error") {
    return <AlertCircle className="size-3.5 text-destructive" />;
  }
  return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
}

function statusLabel(state?: ToolCallState): string {
  switch (state) {
    case "input-streaming":
      return "Preparing call";
    case "input-available":
      return "Calling";
    case "output-available":
      return "Result";
    case "output-error":
      return "Error";
    default:
      return "Running";
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCallCard({ part }: { part: ToolCallPart }) {
  const name = toolNameFromType(part.type);
  const hasInput = part.input !== undefined && part.input !== null;
  const hasOutput = part.output !== undefined && part.output !== null;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wrench className="size-3.5 text-muted-foreground" />
          <span className="font-mono">{name}</span>
        </div>
        <Badge variant="secondary" className="gap-1.5 font-normal">
          <StatusIcon state={part.state} />
          {statusLabel(part.state)}
        </Badge>
      </div>
      {hasInput && (
        <div className="border-b px-3 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Input</p>
          <pre className="overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90">
            {formatValue(part.input)}
          </pre>
        </div>
      )}
      {hasOutput && (
        <div className="px-3 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Output</p>
          <pre className="overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90">
            {formatValue(part.output)}
          </pre>
        </div>
      )}
      {part.state === "output-error" && part.errorText && (
        <div className="px-3 py-2 text-xs text-destructive">
          {part.errorText}
        </div>
      )}
    </div>
  );
}
