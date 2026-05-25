import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import type { ReactNode } from "react";

import { QuotaIndicator } from "./quota-indicator";

type AgentShellProps = {
  title: string;
  description: string;
  input: ReactNode;
  output: ReactNode;
};

export function AgentShell({ title, description, input, output }: AgentShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span>TradeOps Console</span>
          </Link>
          <QuotaIndicator />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <section
            aria-label="Input"
            className="flex flex-col gap-4 rounded-xl border bg-card p-5"
          >
            {input}
          </section>
          <section
            aria-label="Output"
            className="flex flex-col gap-4 rounded-xl border bg-card p-5 min-h-[420px]"
          >
            {output}
          </section>
        </div>
      </main>
    </div>
  );
}
