# ADR-0003: Evaluation framework for agent golden tests

## Status

Accepted (2026-05-25)

## Context

Each of the four agents needs a golden-test harness that:

- Runs in CI on every push without manual intervention.
- Asserts on structured outputs (JSON fields, risk scores, extracted clause lists).
- Is easy to extend: adding a new agent means adding a new scorer file, not learning a
  new tool.
- Produces clear failure output so reviewers can diff expected vs. actual.

The project already has TypeScript and pnpm as baseline tooling. The evaluation
cases are small (approximately 10 fixture pairs per agent at launch).

## Decision

Implement a custom vitest harness with per-agent scorer modules. Each agent gets a
`*.eval.ts` file that imports fixtures, calls the agent function, and asserts on the
return value using vitest `expect` matchers.

## Consequences

**Positive:**

- No new runtime dependency beyond vitest, which doubles as the unit-test runner.
- Scorer logic is plain TypeScript; any team member can read and extend it.
- No vendor lock-in; the harness moves with the repo.
- Runs in the existing CI pipeline once the test job is enabled (see ci.yml TODO comment).

**Negative / trade-offs:**

- Scorer logic must be written by hand rather than generated from YAML declarations.
- No built-in prompt-diff reporting; comparison output is vitest's standard diff.

## Alternatives considered

| Option | Reason rejected |
|--------|-----------------|
| promptfoo | Declarative YAML approach is convenient but adds a heavy CLI dependency; ruled out for minimalism and to avoid learning a second config language. |
| inspect-ai (UK AISI) | Designed for large-scale red-teaming; heavyweight for four agents with approximately 10 cases each. |
