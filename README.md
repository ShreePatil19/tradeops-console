# TradeOps Console

Four AI agents for a trade ops desk. Reasoning streams token by token; tool calls render as cards as they happen.

Live: [tradeops-console.vercel.app](https://tradeops-console.vercel.app)

## Problem

Trade ops desks lose hours per day to email triage, invoice entry, sanctions checks, and customs lookups. This is what an AI version of that desk looks like.

## What it does

| Agent | Input | Output | Tool used |
|---|---|---|---|
| Invoice Extractor | Supplier PDF | Structured JSON line items with confidence scores | `extract_line_items` |
| Inbox Triager | Trade-desk email | Category (RFQ, order, complaint, spam, info) plus a drafted reply | `classify_email`, `draft_reply` |
| Compliance Pre-Check | Counterparty name | Sanctions verdict with cited reasoning | `check_sanctions` |
| Trade Q&A | Customs or Incoterms question | Answer with inline citations to an in-repo knowledge base | `search_corpus` |

## Architecture

```
Browser
  -> Edge (rate limit)
  -> Next.js API routes
  -> Gemini Flash + Vercel KV
```

Worked example: [docs/superpowers/plans/2026-05-25-edge-protection.md](docs/superpowers/plans/2026-05-25-edge-protection.md)

## Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind v4, shadcn/ui
- AI SDK v6, Google Gemini 2.5 Flash
- Vercel KV
- Deployed on Vercel

## Run locally

```sh
pnpm install
```

Create `.env.local`:

```
GOOGLE_GENERATIVE_AI_API_KEY=...
```

Get a key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

```sh
pnpm dev
```

Open http://localhost:3000.

## Run evals

Coming in v0.2 (see issue #25). Once landed: `pnpm eval`.

## Deploy

Push to main. Vercel auto-deploys via the GitHub integration.
