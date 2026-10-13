# context-loop — Operating Manual

How to work with the AI-context system day to day. The model behind it — layers, trust ladder,
retrieval, health signal, invariants — is `.claude/context/engine/specs/context-system.md`; read
it once before changing anything under `.claude/`.

## Setup

A repo has a context-loop instance when it has `.claude/context/budgets.json`
(set one up with `/context-loop:context init`). The SessionStart hook prints a one-line health summary
and links `.claude/context/engine` to the installed plugin. The episodic recall store is optional: opt in with `.claude/context/project.json`
(Docker Postgres + pgvector); without it, everything except recall over past sessions still works.

**Loading:** root `CLAUDE.md`, `.claude/rules/*.md` and the memory index load in every session; a
directory's `CLAUDE.md` loads when a file under it is read; the wiki, playbooks and tracks are
pulled on demand.

## Quick reference

| Command | What it does | Cost | When |
|---|---|---|---|
| `/context-loop:context check` (`health`) | Full health report, every layer, fix command per finding | ~0 | When the session-start line shows findings |
| `/context-loop:context sync` | Walk commits since your cursor, plan canon + wiki updates, ask, apply | LLM, scoped | Weekly-ish, or after a stretch of work |
| `/context-loop:context status` | Show your sync cursor | ~0 | When you forget where you left off |
| `/context-loop:recall <q> [--surface <agent>]` | Tiered recall: wiki → playbook → track → past sessions; `--credit <ids>` when a hit helped | ~0 | Task start; "have we hit this before?" |
| `/context-loop:groom <agent>` | Curate one playbook; promotion proposals both ways | LLM | When the health line says a playbook is over budget |
| `/context-loop:track <op>` | create · resume · handoff · close · index | low | Multi-session work |
| `/context-loop:wiki ingest [scope]` | Fold a change into the wiki (may decide "skip") | LLM | After shipping something wiki-worthy |
| `/context-loop:wiki lint` · `prune` · `review` | Semantic health → remove dead content → strategic re-pass | LLM | When the wiki feels heavy; monthly |
| `/context-loop:update-knowledge [scope]` | Keep the `CLAUDE.md` tree + rules correct and inside `budgets.json` | LLM, scoped | After a convention change, or a canonical finding |

## Daily flow

1. **Start.** Read the health line. Check `.claude/tracks/index.md` if the work spans sessions,
   and resume that track. For an unfamiliar area, `/context-loop:recall <topic>` before reading code.
2. **Delegate scoped work** to the repo's surface agents (`.claude/agents/`); each pulls a tiered
   recall + its playbook index and credits what helped.
3. **Test, review, commit.** Commit playbook changes with the work.
4. **After shipping:** `/context-loop:wiki ingest` if the change passes the gate; track `handoff`
   (or `close`), which regenerates the registry.
5. **Push.** A pre-push health line, if wired, shows whether the change left the context worse.

## Maintenance cadence

| Cadence | What |
|---|---|
| Every session / push | health summary (automatic) |
| Per feature | `wiki ingest` or `update-knowledge` if the gate passes — skipping is valid |
| When nagged | `groom <agent>` (playbook budget) · `update-knowledge <file>` (canonical budget) |
| Weekly-ish | `context sync` |
| Monthly | `wiki lint` → `wiki prune`; `wiki review` |
| After any curation batch | `node .claude/context/engine/scripts/context-health.mjs --snapshot` (trend in `.claude/context/health-history.jsonl`) |

## Two principles

1. **The gate applies to every write.** Gain at least one of *informed, effective, reliable*;
   sacrifice none of *concise, deterministic*. Doing nothing is a valid outcome.
2. **Curation is plan-first and verified.** Sync and groom propose before they write, delete only
   after opening the cited code, and never promote into canon silently.

## Where things live

- Engine: `.claude/context/engine/{specs,scripts}/` · config: `.claude/context/{budgets,project}.json`
- Content: `.claude/wiki/`, `.claude/knowledge/<agent>.md`, `.claude/tracks/`, `.claude/rules/`,
  the `CLAUDE.md` tree · cursor (per developer, gitignored): `.claude/context/state.json`
