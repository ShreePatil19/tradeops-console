// Axiom observability sink.
//
// Fire-and-forget HTTP POST per log entry to the Axiom Ingest API. The
// upstream log() function calls shipToAxiom after writing the entry to
// stdout. When AXIOM_TOKEN or AXIOM_DATASET is missing (typical for local
// dev), shipToAxiom is a no-op and fetch is never invoked. All network
// failures are swallowed so the user request is never blocked.
//
// Env vars:
//   AXIOM_TOKEN     -- Axiom API token (Personal or Ingest).
//   AXIOM_DATASET   -- Target dataset name.
//   AXIOM_HOST      -- Optional host override (default api.axiom.co).

export const AXIOM_DEFAULT_HOST = "api.axiom.co";

export type LogEvent = Record<string, unknown> & {
  _time?: string;
};

type AxiomEnvelope = LogEvent & { _time: string };

export function isAxiomEnabled(): boolean {
  return Boolean(process.env.AXIOM_TOKEN) && Boolean(process.env.AXIOM_DATASET);
}

export function axiomIngestUrl(
  dataset: string,
  host: string = AXIOM_DEFAULT_HOST
): string {
  return `https://${host}/v1/datasets/${encodeURIComponent(dataset)}/ingest`;
}

export function formatAxiomPayload(event: LogEvent): AxiomEnvelope[] {
  const envelope: AxiomEnvelope = {
    ...event,
    _time: typeof event._time === "string" ? event._time : new Date().toISOString(),
  };
  return [envelope];
}

export async function shipToAxiom(event: LogEvent): Promise<void> {
  if (!isAxiomEnabled()) return;
  const token = process.env.AXIOM_TOKEN!;
  const dataset = process.env.AXIOM_DATASET!;
  const host = process.env.AXIOM_HOST || AXIOM_DEFAULT_HOST;
  const url = axiomIngestUrl(dataset, host);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formatAxiomPayload(event)),
    });
  } catch {
    // Fail open. Never block the user request on log shipping.
  }
}
