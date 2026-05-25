// Shared types for the TradeOps eval harness.

export type AgentSlug = 'invoice' | 'inbox' | 'compliance' | 'qa';

export type EvalCase = {
  id: string;
  description: string;
  input: unknown;
  expected?: unknown;
  [k: string]: unknown;
};

export type EvalResult = {
  text: string;
  toolCalls: Array<{ name: string; input: unknown; output?: unknown }>;
  raw: unknown;
};

export type Scorer = (
  c: EvalCase,
  r: EvalResult,
) => { passed: boolean; reason: string };

export type AgentSuite = {
  agent: AgentSlug;
  cases: EvalCase[];
  scorer: Scorer;
  threshold: number;
};
