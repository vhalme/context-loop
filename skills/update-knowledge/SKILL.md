---
name: update-knowledge
description: >-
  Maintain the auto-loaded canonical docs — the CLAUDE.md tree and .claude/rules/*.md — within the
  byte budgets in .claude/context/budgets.json. Use unprompted when a change alters a rule,
  contract or convention an auto-loaded CLAUDE.md or rule file states (a required guard, a status
  value, a route/action contract, an architectural pattern, a new workspace), when a rule no
  longer matches the code, or when the health line reports a canonical file over budget. Not for
  flow narratives (use /context-loop:wiki ingest) or per-task gotchas (agent playbooks).
argument-hint: "[root | rules | <workspace path, e.g. apps/web>]"
---

# /context-loop:update-knowledge — Maintain the auto-loaded canonical docs

Update the **CLAUDE.md tree** and **`.claude/rules/`** to reflect current architecture,
conventions and rules — applying a worthiness gate so the auto-loaded context stays tight,
accurate and not duplicative of the wiki.

**Precondition.** If the repo has no `.claude/context/budgets.json`, say the repo has no
context-loop instance yet and stop.

> **Layer model.**
>
> | Layer | Lives in | Loaded | Owner |
> |---|---|---|---|
> | **1. Code** | the workspaces | n/a | humans + LLM edits |
> | **2. Canonical docs** | `CLAUDE.md` tree, `.claude/rules/*.md` | **auto-loaded** | **THIS SKILL** |
> | **3. Synthesis wiki** | `.claude/wiki/` (entities, flows, subsystems) | on demand via `index.md` | `/context-loop:wiki ingest` |
>
> Adjacent, not owned here: `.claude/knowledge/<agent>.md` playbooks (written by the owning
> agent's retrospective, curated by `/context-loop:groom <agent>`; promotions to canon arrive
> here as groom proposals) and any human-curated narrative docs the repo keeps (leave alone).
>
> **What loads when:** root `CLAUDE.md` + `.claude/rules/` + the memory index load every
> session; a directory's `CLAUDE.md` loads when a file under it is read; sibling docs, the wiki,
> playbooks and tracks are pulled on demand.
>
> **Key fact:** layer 2 is auto-loaded, so every line costs tokens in every future session that
> touches it. Bloat here is more expensive than in the wiki; discipline is correspondingly stricter.

## Usage

Arguments: `$ARGUMENTS`

- (none) — sweep all canonical docs (whole CLAUDE.md tree + `.claude/rules/`)
- `root` — root `CLAUDE.md` only
- `rules` — `.claude/rules/*.md` only
- `<workspace path>` (e.g. `apps/web`, `packages/core`) — that workspace's `CLAUDE.md` and its
  pulled sibling docs

Do not create standalone `ARCHITECTURE.md` / `SECURITY.md`-style files from here; their content
belongs in the wiki (`flows/`, `subsystems/`) and `.claude/rules/`.

## The gate (apply before any write)

The wiki's gate (`${CLAUDE_PLUGIN_ROOT}/specs/wiki.md` § Maintenance discipline), applied to the
auto-loaded layer:

> **"Will an agent doing typical project work be more *informed*, *effective*, *reliable*,
> *concise*, or *deterministic* after this update — without becoming less of any of these?"**

Gain at least one of (informed / effective / reliable); sacrifice none of (concise /
deterministic). If both halves aren't a confident yes, skip — and note the skip briefly.

The constraint side bites harder here: **auto-loaded bloat compounds across every session
forever**, so the bar for adding to a CLAUDE.md or rule file is higher than for a wiki page.

## When to run

- A non-trivial change landed that introduced or changed a rule (guard requirement, status value,
  money logic), a route/action contract, an architectural pattern, or a new workspace
- A `.claude/rules/` rule no longer matches current code
- A CLAUDE.md file says something that is now false

## When NOT to run

- Bug fix without a contract/rule change → git history is enough
- Pure refactor that preserves behaviour; typo, formatting, dep bump, lint fix → never
- One-off task / migration / temporary script
- A new flow narrative or end-to-end concept → `/context-loop:wiki ingest`, not this skill
- A subtle implementation detail you fear losing → the owning agent's playbook
  (`.claude/knowledge/<agent>.md`; `/context-loop:groom` curates it)

## Procedure

### Step 1 — Determine scope

| Arg | Files in scope |
|---|---|
| (none) | root `CLAUDE.md` + every workspace `CLAUDE.md` + `.claude/rules/*.md` — start from `node "${CLAUDE_PLUGIN_ROOT}/scripts/context-health.mjs" --scope canonical` |
| `root` | root `CLAUDE.md` |
| `rules` | `.claude/rules/*.md` |
| `<workspace>` | `<workspace>/CLAUDE.md` + its pulled siblings (e.g. `TESTING.md`, `UI.md`, `PATTERNS.md`) |

### Step 2 — Understand what changed

```bash
git log main..HEAD --oneline && git diff main...HEAD --stat && git diff main...HEAD
```

On the default branch with no divergence: `git log -10 --oneline` and `git diff HEAD~5...HEAD`.

Identify **concepts** that changed, not files: "a new always-required guard", "new status
value", "new route", "renamed exported function".

### Step 3 — Apply the gate per file

For each file in scope, walk the diff and ask the gate question of each candidate update. Skip
those that fail. Patch those that pass in the smallest form that conveys the rule (one bullet,
one table row, one short paragraph).

### Step 4 — Write with discipline

- **Replace, don't append.** Rewrite a section the world made wrong. No "as of <date>" lines —
  git records when.
- **Cite, don't quote.** `path/file.ts#symbol` for symbols, `path/file.ts:LINE` for lines. No
  pasted code blocks.
- **Defer to the wiki for narratives.** More than 3–4 paragraphs of end-to-end flow belongs on a
  flow page: add a one-line pointer here and recommend `/context-loop:wiki ingest`.
- **Defer to `.claude/rules/` for cross-cutting rules.** A rule that applies to several
  workspaces lives there once, not duplicated across their CLAUDE.md files.
- **Cross-link rather than duplicate** — a short pointer such as *"see
  `.claude/wiki/flows/order-payment.md`"*, not a paragraph of synthesis.
- **Stay within size budgets — measured in BYTES, not lines.** A line budget cannot see a
  1,000-byte table cell, which is how a canonical layer bloats while every file "passes" its line
  target. Check with `wc -c`, not `wc -l`.

  Budgets live in **`.claude/context/budgets.json`** — `canonical.files` (per-glob `soft` / `hard`
  bytes) and `canonical.lineBytes` (per-line `soft` / `hard`) — the single table shared with
  `context-health.mjs`. Read the current values there; change a budget there, never here.

  The per-line cap is the load-bearing one: prose smuggled into a table cell is how a file budget
  gets defeated. Reflowing a long cell into short lines *increases* line count while *reducing*
  bytes — a win, not a regression.

  Check the whole layer with `node "${CLAUDE_PLUGIN_ROOT}/scripts/context-health.mjs" --scope
  canonical` (bytes, long lines, stale version claims, workspaces without a `CLAUDE.md`).

  Hitting a cap is a smell. Split detail out to an on-demand sibling (`TESTING.md`, `UI.md`, … —
  pulled by a skill or read when relevant, never auto-loaded), or to the wiki if it is a
  narrative. Do not append and hope.
- **Never add `@` imports of the tree to the root `CLAUDE.md`.** Workspace context is read when
  working in that workspace; the root file is a router. Importing the tree puts every workspace's
  docs in every session regardless of task.

### Step 5 — What belongs where

| Content | Lives in |
|---|---|
| Project identity, workspace structure, top-level commands, tech stack, cross-cutting env vars, known quirks | root `CLAUDE.md` |
| Per-app: auth model summary, route/API map, actions list, state overview, testing entrypoints | app `CLAUDE.md` |
| Per-package: exports, key functions, conventions, schema overview, testing | package `CLAUDE.md` |
| Cross-cutting declarative rules (auth, data access, money handling, …) | `.claude/rules/*.md` |
| End-to-end flow narratives, entity deep-dives, subsystem walkthroughs | **wiki** (via `/context-loop:wiki ingest`) |
| Hard-earned per-task learnings, novel bug fixes, gotchas | `.claude/knowledge/<agent>.md` (owning agent appends; groom curates — not this skill) |
| Stable human-curated narrative | leave alone; suggest manual edits |

### Step 6 — Verify

- No touched file exceeds its budget (re-run `context-health.mjs --scope canonical`)
- No duplication of content the wiki covers (replace with a pointer)
- No code blocks longer than ~10 lines (cite instead)
- No "as of <date>" or change-narrative phrasing
- Cross-refs to wiki pages use the `path/to/file.md` form so they stay navigable

### Step 7 — Report

One line per file: which files changed, the concept-level change in each, and anything
considered but intentionally left unchanged.

### Step 8 — Suggest a wiki ingest if warranted

If the changes affect concepts with wiki pages (scan `.claude/wiki/index.md`), add one line:

> Consider `/context-loop:wiki ingest <scope>` to sync the wiki's synthesis layer with these changes.

Do NOT run it yourself — the user decides whether it passes the wiki gate. Skip the hint when all
updates were rule-level and touch no synthesized concept.

## Anti-patterns

- **Adding narrative to CLAUDE.md** ("the way orders work is…") — wiki territory. Cross-link.
- **Pasting code into the canonical docs.** Cite `path/file.ts#symbol`.
- **Duplicating a rule across several CLAUDE.md files.** Move it to `.claude/rules/` once.
- **Editing human-curated narrative docs** — suggest edits instead.
- **Editing `.claude/knowledge/<agent>.md`.** Playbooks are written by the agent's retrospective
  and edited only by groom. When a groom proposes a curated → canon promotion, *this* skill
  applies the canon side; the next groom trims the playbook entry to a pointer.
- **Updating for a typo / refactor / dep bump.** Skip.
- **Logging "as of <date>" history in the doc.** Git owns that.
- **Touching every CLAUDE.md "just in case" when one workspace changed.** Scope tightly.
- **Defending stale content for backward compatibility.** Canonical means current. Replace.
