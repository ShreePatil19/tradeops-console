// vercel-env-sync: read a local env file and add each var to one or more
// Vercel environments (development, preview, production) in a single command.
//
// Usage:
//   pnpm env:sync --file=.env.production
//   pnpm env:sync --file=.env.local --dry-run
//   pnpm env:sync --file=.env.local --env=preview,production
//
// Requires the Vercel CLI installed and the project linked (.vercel/project.json
// in the working directory).

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

export type VercelTargetEnv = "development" | "preview" | "production";

export const DEFAULT_TARGET_ENVS: VercelTargetEnv[] = [
  "development",
  "preview",
  "production",
];

const VALID_TARGET_ENVS = new Set<string>(DEFAULT_TARGET_ENVS);

export type EnvVarPlan = {
  name: string;
  env: VercelTargetEnv;
  value: string;
  command: string;
};

const KEY_VALUE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function stripQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnvFile(content: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = KEY_VALUE_RE.exec(raw);
    if (!match) continue;
    const key = match[1]!;
    const rawValue = match[2] ?? "";
    out.set(key, stripQuotes(rawValue.trim()));
  }
  return out;
}

export function buildCommandPlan(
  vars: Map<string, string>,
  targetEnvs: readonly string[]
): EnvVarPlan[] {
  for (const e of targetEnvs) {
    if (!VALID_TARGET_ENVS.has(e)) {
      throw new Error(
        `invalid Vercel environment "${e}"; expected one of development, preview, production`
      );
    }
  }
  const plan: EnvVarPlan[] = [];
  for (const [name, value] of vars) {
    for (const env of targetEnvs) {
      plan.push({
        name,
        env: env as VercelTargetEnv,
        value,
        command: `vercel env add ${name} ${env}`,
      });
    }
  }
  return plan;
}

type CliArgs = {
  file: string;
  dryRun: boolean;
  envs: VercelTargetEnv[];
};

function parseArgv(argv: readonly string[]): CliArgs {
  let file = ".env.production";
  let dryRun = false;
  let envs: VercelTargetEnv[] = [...DEFAULT_TARGET_ENVS];
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--file=")) {
      file = arg.slice("--file=".length);
    } else if (arg.startsWith("--env=")) {
      const list = arg.slice("--env=".length).split(",").map((s) => s.trim());
      for (const e of list) {
        if (!VALID_TARGET_ENVS.has(e)) {
          throw new Error(
            `--env contains invalid value "${e}"; expected development, preview, or production`
          );
        }
      }
      envs = list as VercelTargetEnv[];
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { file, dryRun, envs };
}

function printHelp(): void {
  process.stdout.write(
    [
      "vercel-env-sync: push env vars to Vercel from a local file.",
      "",
      "Usage:",
      "  pnpm env:sync --file=.env.production",
      "  pnpm env:sync --file=.env.local --dry-run",
      "  pnpm env:sync --file=.env.local --env=preview,production",
      "",
      "Flags:",
      "  --file=PATH   Path to the env file (default: .env.production).",
      "  --env=LIST    Comma-separated subset of envs (default: all 3).",
      "  --dry-run     Print commands only; do not call vercel.",
      "  --help        Show this help.",
      "",
    ].join("\n")
  );
}

function runOne(plan: EnvVarPlan): Promise<void> {
  return new Promise((resolve, reject) => {
    // Discrete argv (no shell) so any future change cannot accidentally
    // shell-interpolate plan.name or plan.env. `shell: true` would give zero
    // benefit here since we never embed values in the command string.
    const child = spawn("vercel", ["env", "add", plan.name, plan.env], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.stdin.write(`${plan.value}\n`);
    child.stdin.end();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`vercel env add ${plan.name} ${plan.env} exited ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgv(process.argv.slice(2));
  const raw = readFileSync(args.file, "utf8");
  const vars = parseEnvFile(raw);
  if (vars.size === 0) {
    process.stderr.write(`[env-sync] no variables found in ${args.file}\n`);
    process.exit(2);
  }
  const plan = buildCommandPlan(vars, args.envs);
  process.stdout.write(
    `[env-sync] ${vars.size} var(s) x ${args.envs.length} env(s) = ${plan.length} command(s)\n`
  );
  if (args.dryRun) {
    for (const p of plan) {
      process.stdout.write(`  DRY ${p.command}\n`);
    }
    return;
  }
  for (const p of plan) {
    process.stdout.write(`  ${p.command}\n`);
    await runOne(p);
  }
}

// Run main only when executed directly, not when imported by the tests.
const invokedAsScript =
  process.argv[1] !== undefined &&
  /vercel-env-sync\.(ts|js|mjs)$/.test(process.argv[1]);

if (invokedAsScript) {
  main().catch((err: unknown) => {
    process.stderr.write(`[env-sync] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
