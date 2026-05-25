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
