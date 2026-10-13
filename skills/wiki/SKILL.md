---
name: wiki
description: >-
  Maintain and consult the repo's LLM wiki (.claude/wiki/). Use `query` unprompted for "how does
  X work end-to-end" / "where is X handled" questions before grepping source; `ingest` after
  shipping something non-trivial (invariant, contract or concept changed; gotcha surfaced); `lint`
  when the session-start health line reports wiki findings; `prune` / `review` on a lint hand-off
  or periodic cadence. No argument suggests which operation is due.
argument-hint: "[ingest [scope] | lint [--quick] [scope] | prune [scope] | review [scope] | query <question>]"
---

# /context-loop:wiki — LLM wiki maintenance

The wiki lives at `.claude/wiki/` (`index.md`, `log.md`, `entities/`, `flows/`, `subsystems/`,
repo-specific `workflows/`). Schema, update modes and the five-qualities gate:
`${CLAUDE_PLUGIN_ROOT}/specs/wiki.md`.

**Precondition.** If the repo has no `.claude/context/budgets.json`, say the repo has no
context-loop instance yet and stop.

> **Objective of every wiki operation:** afterwards, agents working with the project are more
> *informed*, *effective*, *reliable*, *concise* and *deterministic*. Each workflow applies this
> gate (`specs/wiki.md` § Maintenance discipline) before writing. Skip operations that don't
> pass — doing nothing is a valid outcome.

## Usage

- `ingest [scope]` — fold recent code changes into the wiki (decision-led; may decide no update)
- `lint [scope]` — full health check (mechanical script + LLM semantic checks)
- `lint --quick` — mechanical drift check only (no LLM, ~0 tokens)
- `prune [scope]` — actively remove dead / low-value content (post-lint, or on demand)
- `review [scope]` — periodic strategic re-pass: are pages still earning their keep?
- `query <question>` — answer a question from the wiki first, then verify against code
- (none) — suggest which operation to run

`scope` (optional): a page slug, a category, or free-form ("the recent order changes").

## Instructions

Arguments: `$ARGUMENTS`. The subcommand is the first whitespace-delimited token; the remainder is
the scope (or, for `query`, the question).

### Step 1 — Resolve the subcommand

| Subcommand | Workflow file |
|---|---|
| `ingest` | `${CLAUDE_SKILL_DIR}/workflows/ingest.md` |
| `lint` | `${CLAUDE_SKILL_DIR}/workflows/lint.md` |
| `prune` | `${CLAUDE_SKILL_DIR}/workflows/prune.md` |
| `review` | `${CLAUDE_SKILL_DIR}/workflows/review.md` |
| `query` | `${CLAUDE_SKILL_DIR}/workflows/query.md` |
| (none) | Step 1a |

**Special case `lint --quick`:** do NOT load the lint workflow. Run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/context-health.mjs" --scope wiki` and report its stdout
verbatim. No LLM analysis (= `/context-loop:context check --scope wiki`).

### Step 1a — Auto-suggest (no subcommand)

Inspect the wiki state and recommend ONE operation:

1. Read `.claude/wiki/log.md` for the date of the most recent entry per op.
2. Check `git log` for non-trivial code changes since the most recent `ingest` entry.
3. Priority:
   - Outstanding changes that pass the wiki-worthiness gate (per `workflows/ingest.md`) → `ingest [scope]`
   - Last `lint` > 7 days ago, or never → `lint`
   - Last `lint` left unhandled medium+ findings → `prune` or `ingest`, per its hand-off section
   - Last `review` > 30 days ago → `review`
   - Nothing pressing → say so explicitly; do not invent work

Output the suggestion as one sentence plus a one-line "why".

### Step 2 — Read the workflow file

Read it in full, then follow its Procedure — do not improvise.

### Step 3 — Apply the wiki-worthiness gate (`ingest` only)

The ingest workflow opens with a decision tree. Walk it explicitly. If the answer is "skip", log
the skip in `.claude/wiki/log.md` and stop — do not silently do nothing, and do not ingest "just
to be safe".

### Step 4 — Execute against `scope`

- `ingest`: limit the affected-page scan to pages matching `scope`
- `lint`: limit checks to matching pages (default: all)
- `prune`: usually a specific page or section
- `review`: usually a category (`entities`, `flows`) or `all`

### Step 5 — Log

Every wiki write — including `ingest | skipped — <reason>` decisions — appends one entry to
`.claude/wiki/log.md` in the workflow's prescribed format.

### Step 6 — Report

- What was done (or explicitly: nothing, because <reason>)
- Which pages / sections changed; any follow-up (e.g. lint criticals → `ingest <page>`)

## Non-negotiables

- **Lint and prune are paired.** Lint reports; prune removes, only on a lint or user signal.
- **Ingest may decide to skip.** That is a successful ingest pass. Always log the skip.
- **Bounded sections are bounded.** When `Common pitfalls` is at 7 and an 8th is wanted, rotate
  one out — do not append.
- **Replace, don't append.** When a section is wrong, rewrite it. Never add "as of <date>, …".
- **No code in the wiki.** Cite `path/file.ts#symbol`; a snippet only if it teaches something the
  path won't.
- **Bump `last_verified`** only when you actually re-checked the claims against code.
