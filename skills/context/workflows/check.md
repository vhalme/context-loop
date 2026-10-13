# Workflow: context check — stateless probe

Stateless, read-only health check across every AI-context layer. Answers: **"Is the context
consistent with the code and within its budgets, right now?"**

This is the linter for context. It advances no cursor, consults no state beyond git dates, and
never writes (except `--snapshot`, which appends one metrics line). Every invocation is an
independent snapshot. Its `--summary` line is what every session start and every `git push`
prints; `check` is the full report behind it.

## What it covers

| Layer | Files scanned | Checks beyond citations |
|---|---|---|
| **wiki** | `.claude/wiki/**/*.md` + `.claude/context/workflows/*.md` | status vocabulary · `last_verified` freshness · edited after `last_verified` · line caps · `sources:`/`related:` list caps · `log.md` heading format · index length |
| **canonical** | Root `CLAUDE.md`, `AGENTS.md`, workspace `CLAUDE.md` files (e.g. `apps/*/`, `packages/*/`), `.claude/rules/*.md` | byte caps (soft → WARN, hard → BROKEN) · overlong lines · tech-table version claims vs installed majors · workspaces without a `CLAUDE.md` |
| **playbooks** | `.claude/knowledge/<agent>.md` | byte + entry budgets (→ `/context-loop:groom <agent>`) · duplicate `##` sections · dated `##` headings · entries missing from the navigation index · v2 `tags:` lines |
| **tracks** | `.claude/tracks/*.md` | frontmatter fields + status vocabulary · id = filename · `Resume here` present · `active` but untouched too long · files that are neither a track nor a `parent:` sub-document · `index.md` ≠ generated registry |
| **agents** | `.claude/agents/*.md`, `.claude/commands/*.md` | frontmatter present · `maxTurns` aligned · cited paths exist |
| **store** (`--with-store`) | the knowledge Postgres | counts by status · unembedded · exact duplicates · off-vocabulary types · last ingest age |

All thresholds come from `.claude/context/budgets.json` — change them there, never in the script.

## What it detects (mechanical — no LLM)

- `sources:` frontmatter paths whose file no longer exists
- Inline `` `path/file.ts[#symbol|:line]` `` refs whose file or symbol is gone (any layer)
- `[[type:slug]]` cross-refs to wiki pages that don't exist and aren't listed under "Planned" in
  `.claude/wiki/index.md`; `[[track:NNN-slug]]` refs resolve against `.claude/tracks/`
- Everything in the table above

Fenced code blocks are stripped before scanning — examples and templates don't count. Severity:
**BROKEN** = a claim that is false now; **WARN** = drift that will mislead soon; **INFO** =
housekeeping. Every finding carries the command that fixes it.

## What it does NOT detect (needs LLM)

- Behavioural drift (a function still exists but its semantics changed)
- Invariants that quietly stopped holding
- "Common pitfalls" entries that are no longer possible
- Pages whose narrative is stale but whose paths/symbols still resolve

For those, escalate to `/context-loop:wiki review` or `/context-loop:wiki lint` (LLM-augmented).

## How it serves the five qualities

A clean run confirms the metadata is *informed* (paths resolve), *reliable* (no broken
cross-refs) and *deterministic* (no orphan refs creating ambiguity). Findings name exactly what
to fix. The probe itself is *concise* — pure script, no LLM, ~0 tokens.

## Procedure

### 1. Run the script

```sh
node .claude/context/engine/scripts/context-health.mjs                # default: --scope all
node .claude/context/engine/scripts/context-health.mjs --scope wiki   # wiki|canonical|playbooks|tracks|agents
node .claude/context/engine/scripts/context-health.mjs --with-store   # add knowledge-store checks
node .claude/context/engine/scripts/context-health.mjs --summary      # the one-liner the hooks print
node .claude/context/engine/scripts/context-health.mjs --json         # findings + metrics for tooling
node .claude/context/engine/scripts/context-health.mjs --snapshot     # append metrics to health-history.jsonl
```

Always exits `0` (warn-only). The report is on stdout. `--snapshot` appends to
`.claude/context/health-history.jsonl` and is run by the orchestrator after curation — once
after a batch of grooms (never from inside a groom), and at the end of `context sync` and
`wiki prune` — not per session. The history file is how "better over time" is measured.

### 2. Read the report

Per layer, per file, per finding:

```
### Layer: wiki (N findings)

.claude/wiki/flows/foo.md
  [BROKEN]  inline ref: apps/web/services/bar.ts (file missing)
  [WARN  ]  unresolved cross-ref: [[entity:nonexistent]] (no wiki page, not in Planned)
```

`BROKEN` = the cited file or symbol no longer exists — always act. `WARN` = unresolved cross-ref
or heuristic symbol match — triage, may be a false positive.

### 3. Classify and hand off

The script ends with suggested follow-ups. Decide per finding:

- Real drift → the suggested command (wiki: `/context-loop:wiki ingest <pages>`; canonical:
  `/context-loop:update-knowledge <scope>`; playbook: `/context-loop:groom <agent>`; tracks:
  `node .claude/context/engine/scripts/tracks-index.mjs`)
- Dead content (the concept no longer exists) → `/context-loop:wiki prune` for the wiki, a
  manual edit for canonical
- False positive (heuristic missed something) → annotate the doc or report it against the engine

### 4. (Optional) Full mode with LLM

For the wiki only, `/context-loop:wiki lint` runs the script first, then LLM checks for
contradictions, freshness and semantic drift. There is no full mode for canonical.

## When to run

- **Every session start** — the `--summary` line, via the plugin's SessionStart hook
- **Every push** — the same line from a pre-push hook if the repo wires one (warn-only)
- **Manual** — `/context-loop:context check` for the full report
- **Before `wiki review`** — clears mechanical noise so review can focus on semantics
- **After a large code-change batch**

Cheap to over-run; the bigger risk is under-running.

## Anti-patterns

- **Treating WARN as BROKEN.** WARN includes heuristic symbol matches that can be false positives.
- **Auto-fixing without classifying.** A broken inline ref may be a typo (fix the ref) or a real
  removal (fix the doc). They look the same to the script.
- **Calling an LLM on every finding.** Most drift is a one-line patch faster done by hand.
