---
name: context
description: Multi-layer AI-context operations — health check, sync cursor, status, help. Use when the session-start health line shows findings (run check), after a stretch of coding or after pulling others' commits (run sync), or when asked how the context system works (help).
argument-hint: "[check|health [--scope S] [--with-store] [--snapshot] | sync | status | help]"
---
# /context-loop:context — AI-context metadata management

Multi-layer operations across the AI-context metadata: the wiki (`.claude/wiki/`), the
`CLAUDE.md` tree, `.claude/rules/`, playbooks (`.claude/knowledge/`) and tracks
(`.claude/tracks/`).

> **Objective of every context operation:** afterwards, agents working on the project are more
> *informed*, *effective*, *reliable*, *concise* and *deterministic*. The five-qualities gate is
> defined in `${CLAUDE_PLUGIN_ROOT}/specs/wiki.md` § Maintenance discipline and applies identically to all layers.

Arguments: `$ARGUMENTS`

## Step 0 — Instance check

`help` works anywhere. For every other subcommand: if the repo has no
`.claude/context/budgets.json`, say the repo has no context-loop instance yet
(`/context-loop:context init` is planned) and stop.

## Step 1 — Resolve the subcommand

Parse `$ARGUMENTS`: the first whitespace-delimited token is the subcommand, the rest are flags.

| Subcommand | Procedure | Behavior |
|---|---|---|
| `check` / `health` | `${CLAUDE_SKILL_DIR}/workflows/check.md` | Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/context-health.mjs" [--scope <s>] [--with-store] [--snapshot]`; report stdout verbatim. No LLM analysis. |
| `sync` | `${CLAUDE_SKILL_DIR}/workflows/sync.md` | Read cursor, plan, ask, execute, advance cursor. **Plan-first — never write without user confirmation.** |
| `status` | (trivial) | Read `.claude/context/state.json` and pretty-print it. Missing or `null` fields → "never synced." |
| `help` | `${CLAUDE_SKILL_DIR}/help.md` | Read it and print it verbatim. No analysis, no synthesis. |
| (none) | Step 1a | Suggest one operation. |

`--scope` takes `wiki|canonical|playbooks|tracks|agents|all` (default `all`). `--with-store`
also queries the knowledge store (needs its Postgres running). Budgets (byte caps, freshness
windows, entry limits) live in `.claude/context/budgets.json`.

### Step 1a — Auto-suggest (no subcommand)

1. Read `.claude/context/state.json` if present; count commits since `lastSyncedSha`.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/context-health.mjs" --summary`.
3. Recommend ONE operation, as a single sentence plus a one-line "why":
   - findings ≥ 1 → `check` (surface the broken count);
   - commits since cursor ≥ 5 (or never synced) → `sync`;
   - both → `check` first (cheap), `sync` after triage;
   - neither → "Context is in sync and clean. Nothing to do."

## Step 2 — Execute (check / sync)

Read the procedure file named in the table, then follow its Procedure section to the letter —
do not improvise. Where it says `node .claude/context/engine/scripts/<script>.mjs`, you may run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/<script>.mjs"` instead (same engine). Fix hints printed by
the script use short command names: `/wiki ingest` = `/context-loop:wiki ingest`,
`/update-knowledge` = `/context-loop:update-knowledge`, `/groom` = `/context-loop:groom`.

For `sync`: compute the commit window, apply the gate per change, **produce the plan and wait
for confirmation**, dispatch accepted items to `/context-loop:update-knowledge` (first) and
`/context-loop:wiki ingest` (second), advance `.claude/context/state.json` only when every
item succeeded, append the `sync` entry to `.claude/wiki/log.md`, then run `--snapshot`.

## Step 3 — Report

Brief: what was done, what was skipped (with reasons), the new cursor SHA (sync), follow-ups.

## Non-negotiables

- **Check is read-only.** Never modify files during `check` (`--snapshot` only appends to
  `.claude/context/health-history.jsonl`, and only the orchestrator asks for it).
- **Sync is plan-first.** No write to canon, wiki or the state file before confirmation.
- **The cursor advances only on full success.** Partial failure leaves it put so re-runs are clean.
- **Dispatch, don't reinvent.** Sync calls `wiki ingest` and `update-knowledge`; never bypass
  their per-layer gates.
- **The five qualities are the gate.** An operation that fails it is a no-op, logged as such.
