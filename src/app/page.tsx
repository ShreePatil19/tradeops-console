import Link from "next/link";
import { FileText, Inbox, ShieldCheck, Search, ArrowUpRight } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.77 1.06.77 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56C20.71 21.38 24 17.08 24 12 24 5.65 18.85.5 12 .5Z" />
    </svg>
  );
}

type Agent = {
  slug: string;
  name: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
};

const agents: Agent[] = [
  {
    slug: "invoice-extractor",
    name: "Invoice Extractor",
    blurb:
      "Drop a supplier PDF. The vision model returns structured JSON line items with confidence scores.",
    icon: FileText,
  },
  {
    slug: "inbox-triager",
    name: "Inbox Triager",
    blurb:
      "Paste a trade-desk email. Get a category (RFQ, order, complaint, spam, info) and a drafted reply.",
    icon: Inbox,
  },
  {
    slug: "compliance",
    name: "Compliance Pre-Check",
    blurb:
      "Enter a counterparty name. Get a sanctions verdict with cited reasoning before you transact.",
    icon: ShieldCheck,
  },
  {
    slug: "qa",
    name: "Trade Q&A",
    blurb:
      "Ask about AU customs or Incoterms. Get an answer with inline citations to a small knowledge base.",
    icon: Search,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-16 sm:py-24">
        <header className="flex flex-col gap-5">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            TradeOps Console
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Trade ops desks lose hours per day to email triage, invoice entry,
            sanctions checks, and customs lookups. This is what an AI version of
            that desk looks like.
          </p>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Four AI agents for an Australian trade ops desk. They read supplier
            PDFs, route inbound email, run sanctions pre-checks, and answer
            customs questions with citations. Reasoning streams token by token;
            tool calls render as cards as they happen.
          </p>
        </header>

        <section aria-label="How it works">
          <h2 className="mb-6 font-heading text-xl font-semibold tracking-tight">
            How it works
          </h2>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-0">
            {/* Step 1: Input */}
            <div className="flex w-full flex-col items-center gap-3 rounded-xl bg-card px-5 py-5 text-center ring-1 ring-foreground/10 sm:w-56">
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <p className="text-sm font-medium text-card-foreground">Input</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Drop a file, paste an email, or type a question.
              </p>
            </div>

            {/* Connector arrow 1 */}
            <div className="flex h-8 items-center justify-center sm:h-auto sm:flex-1 sm:self-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 rotate-90 text-muted-foreground sm:rotate-0"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            {/* Step 2: Tool calls */}
            <div className="flex w-full flex-col items-center gap-3 rounded-xl bg-card px-5 py-5 text-center ring-1 ring-foreground/10 sm:w-56">
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                  aria-hidden="true"
                >
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-card-foreground">Tool calls</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The agent invokes typed tools: vision extraction, sanctions
                lookup, RAG search, classification.
              </p>
            </div>

            {/* Connector arrow 2 */}
            <div className="flex h-8 items-center justify-center sm:h-auto sm:flex-1 sm:self-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 rotate-90 text-muted-foreground sm:rotate-0"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            {/* Step 3: Answer with citations */}
            <div className="flex w-full flex-col items-center gap-3 rounded-xl bg-card px-5 py-5 text-center ring-1 ring-foreground/10 sm:w-56">
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                  aria-hidden="true"
                >
                  <line x1="17" y1="10" x2="3" y2="10" />
                  <line x1="21" y1="6" x2="3" y2="6" />
                  <line x1="21" y1="14" x2="3" y2="14" />
                  <line x1="17" y1="18" x2="3" y2="18" />
                </svg>
              </div>
              <p className="text-sm font-medium text-card-foreground">
                Answer with citations
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Reasoning streams token by token. Tool calls and citations
                render as cards.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Agents"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <Link
                key={agent.slug}
                href={`/agents/${agent.slug}`}
                className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              >
                <Card className="h-full transition-all group-hover:shadow-md group-hover:ring-foreground/20">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                        <Icon className="size-5" />
                      </div>
                      <ArrowUpRight className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                    <CardTitle className="mt-3 text-lg">{agent.name}</CardTitle>
                    <CardDescription className="mt-1 leading-relaxed">
                      {agent.blurb}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </section>
      </main>

      <footer className="border-t bg-background/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Built by Shreeshailya Patil · Sydney · 2026</p>
          <Link
            href="https://github.com/ShreePatil19/tradeops-console"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-medium text-foreground hover:underline"
          >
            <GithubMark className="size-4" />
            github.com/ShreePatil19/tradeops-console
          </Link>
        </div>
      </footer>
    </div>
  );
}
