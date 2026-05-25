# ADR-0001: Model choice for all agents

## Status

Accepted (2026-05-25)

## Context

TradeOps Console exposes four AI agents: contract analyzer, risk scorer, clause extractor,
and trade-document classifier. Each agent needs:

- Vision capability to process uploaded PDFs and scanned documents.
- Reliable tool-call support for structured JSON outputs.
- Streaming responses for low perceived latency.
- A free tier sufficient to serve a public demo without upfront spend.

The project uses the Vercel AI SDK (`ai` package) with provider adapters (`@ai-sdk/*`),
so the model choice is expressed as a single import swap.

## Decision

Use Google Gemini 2.5 Flash via `@ai-sdk/google` as the model for all four agents.

## Consequences

**Positive:**

- Free tier covers v0.2 demo traffic: 15 RPM and 1,500 RPD with no billing setup.
- First-token latency is typically 1 to 3 seconds, acceptable for an async analysis flow.
- `@ai-sdk/*` adapter pattern keeps the codebase vendor-neutral; swapping to another
  provider requires changing one import and one model-ID string per agent file.
- Native vision support handles PDF pages as image parts without a separate OCR step.

**Negative / trade-offs:**

- RPM and RPD quotas are low; hitting them during a demo requires exponential backoff
  or a rate-limit store (see ADR-0002).
- Google API availability is outside project control; no SLA on the free tier.

## Alternatives considered

| Option | Reason rejected |
|--------|-----------------|
| Anthropic Claude 3.5 Sonnet | No free tier after trial credits; paid plan required for sustained usage. |
| OpenAI GPT-4o | No free tier; usage-based billing adds cost risk for a public demo. |
| Self-hosted Llama 3.2 Vision | No available GPU infra; deployment complexity out of scope for v0.2. |
