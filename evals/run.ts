// CLI entry point for the TradeOps eval harness.
// Usage: pnpm eval [--agent <slug|all>] [--base-url <url>] [--help]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { callAgent } from './client.js';
import { buildMessagesFromCase, isFixtureCase } from './messages.js';
import type { AgentSlug, EvalCase, Scorer, AgentSuite } from './types.js';

const AGENT_SLUGS: AgentSlug[] = ['invoice', 'inbox', 'compliance', 'qa'];

// Issue numbers used in placeholder descriptions, keyed by slug.
const ISSUE_MAP: Record<AgentSlug, number> = {
  invoice: 38,
  inbox: 39,
  compliance: 40,
  qa: 41,
};

const THRESHOLDS: Record<AgentSlug, number> = {
  invoice: 1.0,
  inbox: 1.0,
  compliance: 1.0,
  qa: 1.0,
};

function printHelp(): void {
  console.log(
    [
      '',
      'Usage: pnpm eval [options]',
      '',
      'Options:',
      '  --agent <slug>     Agent to evaluate: invoice, inbox, compliance, qa, all (default: all)',
      '  --base-url <url>   Override the target base URL (default: EVAL_BASE_URL env or http://localhost:3000)',
      '  --help, -h         Print this help message and exit',
      '',
      'Examples:',
      '  pnpm eval --agent qa',
      '  pnpm eval --agent all --base-url http://localhost:3000',
      '',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): {
  agent: AgentSlug | 'all';
  baseUrl: string | undefined;
  help: boolean;
} {
  const args = argv.slice(2);
  let agent: AgentSlug | 'all' = 'all';
  let baseUrl: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
    } else if (flag === '--agent') {
      const val = args[++i];
      if (!val) {
        console.error('--agent requires a value');
        process.exit(1);
      }
      if (val !== 'all' && !(AGENT_SLUGS as string[]).includes(val)) {
        console.error(
          `Unknown agent "${val}". Valid values: ${['all', ...AGENT_SLUGS].join(', ')}`,
        );
        process.exit(1);
      }
      agent = val as AgentSlug | 'all';
    } else if (flag === '--base-url') {
      baseUrl = args[++i];
      if (!baseUrl) {
        console.error('--base-url requires a value');
        process.exit(1);
      }
    } else {
      console.error(`Unknown flag: ${flag}`);
      process.exit(1);
    }
  }

  return { agent, baseUrl, help };
}

async function loadSuite(slug: AgentSlug): Promise<AgentSuite> {
  const evalsDir = resolve(process.cwd(), 'evals');

  const casesPath = resolve(evalsDir, slug, 'cases.json');
  const cases: EvalCase[] = JSON.parse(readFileSync(casesPath, 'utf-8'));

  const scorerPath = pathToFileURL(
    resolve(evalsDir, slug, 'scorer.ts'),
  ).toString();
  const scorerModule = (await import(scorerPath)) as {
    [key: string]: Scorer;
  };

  // The scorer export is named score<Agent> (e.g. scoreQa, scoreInvoice).
  const exportName = `score${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
  const scorer = scorerModule[exportName];
  if (typeof scorer !== 'function') {
    throw new Error(
      `scorer.ts for "${slug}" must export a function named "${exportName}"`,
    );
  }

  return {
    agent: slug,
    cases,
    scorer,
    threshold: THRESHOLDS[slug],
  };
}

async function runSuite(
  suite: AgentSuite,
  baseUrl: string | undefined,
): Promise<{ passed: number; total: number }> {
  const slug = suite.agent;
  console.log(`\nRunning evals for agent: ${slug}`);

  let passed = 0;

  for (const c of suite.cases) {
    // Starter cases skip the live call. A case counts as a real case if it
    // has either an input array or a fixture field; both are routed through
    // buildMessagesFromCase below.
    const isStarterPlaceholder =
      c.id.endsWith('-starter') && c.input === null && !isFixtureCase(c);

    let result;
    if (isStarterPlaceholder) {
      // Return a synthetic empty result so the scorer can mark it passed
      // without hitting the live API.
      result = { text: '', toolCalls: [], raw: null };
    } else {
      const messages = buildMessagesFromCase(c);
      result = await callAgent(slug, messages, { baseUrl });
    }

    const verdict = suite.scorer(c, result);
    const label = verdict.passed ? 'PASS' : 'FAIL';
    console.log(`  [${label}] ${c.id}: ${c.description}`);
    if (!verdict.passed) {
      console.log(`         Reason: ${verdict.reason}`);
    }
    if (verdict.passed) passed++;
  }

  const total = suite.cases.length;
  const pct = total === 0 ? 100 : Math.round((passed / total) * 100);
  const thresholdPct = Math.round(suite.threshold * 100);
  const met = pct >= thresholdPct;

  console.log(
    `${slug}: ${passed}/${total} passed (threshold ${thresholdPct}%, ${met ? 'met' : 'NOT MET'})`,
  );

  return { passed, total };
}

async function main(): Promise<void> {
  const { agent, baseUrl, help } = parseArgs(process.argv);

  if (help) {
    printHelp();
    process.exit(0);
  }

  const slugs: AgentSlug[] =
    agent === 'all' ? AGENT_SLUGS : [agent as AgentSlug];

  let anyFailed = false;

  for (const slug of slugs) {
    const suite = await loadSuite(slug);
    const { passed, total } = await runSuite(suite, baseUrl);

    const threshold = THRESHOLDS[slug];
    const passRate = total === 0 ? 1 : passed / total;
    if (passRate < threshold) {
      anyFailed = true;
    }

    // Suppress unused-variable lint; ISSUE_MAP is referenced for documentation.
    void ISSUE_MAP[slug];
  }

  if (anyFailed) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Eval harness error:', err);
  process.exit(1);
});
