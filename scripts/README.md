# Scripts

## env:sync — push env vars to Vercel in one command

Reads a local env file and runs `vercel env add NAME ENV` for each variable across the chosen Vercel environments.

```bash
# Sync .env.production to all 3 envs (default).
pnpm env:sync --file=.env.production

# Sync .env.local to just preview + production.
pnpm env:sync --file=.env.local --env=preview,production

# Show the commands without calling Vercel.
pnpm env:sync --file=.env.local --dry-run
```

### Requirements

- Vercel CLI installed and authenticated (`vercel login`).
- Project linked to a Vercel project (the repo already has `.vercel/project.json`).
- The env file uses standard `KEY=VALUE` shape. Comments (`# ...`) and blank lines are skipped. Surrounding single or double quotes are stripped from values.

### Notes

- `--env` must be a subset of `development,preview,production`. Any other value rejects.
- Each `vercel env add` invocation prompts for the value over stdin; the script pipes it automatically.
- If a variable already exists in a target env, Vercel will fail that single add but the script continues. Re-run with `vercel env rm NAME ENV` first if you need to overwrite.
- The script lives in `scripts/vercel-env-sync.ts` with pure helpers (`parseEnvFile`, `buildCommandPlan`) covered by `tests/scripts/vercel-env-sync.test.ts`.
