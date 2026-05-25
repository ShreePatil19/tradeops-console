# TradeOps Console

Four agents for a trade ops desk. Reasoning streams token by token; tool calls render as cards as they happen.

Live: [tradeops-console.vercel.app](https://tradeops-console.vercel.app)

## What it does

| Agent | Input | Output |
|---|---|---|
| Invoice Extractor | Supplier PDF | Structured JSON line items with confidence scores |
| Inbox Triager | Trade-desk email | Category (RFQ, order, complaint, spam, info) plus a drafted reply |
| Compliance Pre-Check | Counterparty name | Verdict with cited reasoning over a stub sanctions list |
| Trade Q&A | Customs or Incoterms question | Answer with inline citations to an in-repo RAG corpus |

## Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind v4, shadcn/ui
- Anthropic Messages API (vision, tool use, SSE streaming)
- In-repo JSON embeddings for RAG (no external vector DB)
- Vercel edge functions

## Run locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000.

Production bundle:

```sh
pnpm build
pnpm start
```

## Status

7-day build. Day 1 is the placeholder homepage. The four agents land across days 2 to 5. The agent grid on the homepage shows the current ship status per agent.
