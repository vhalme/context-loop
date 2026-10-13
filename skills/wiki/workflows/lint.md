# Workflow: Lint

Read-only health check on the wiki. **Detects** drift, bloat and contradictions — does NOT remove
or rewrite content (that is `prune.md` and `ingest.md`).

## Two modes

| Mode | Invocation | What runs | Token cost |
|---|---|---|---|
| **Quick** | `/context-loop:wiki lint --quick` (= `/context-loop:context check --scope wiki`) | Step 1 only — the script. No LLM. | ~0 |
| **Full** | `/context-loop:wiki lint [scope]` | Step 1, then the LLM checks in steps 2–3. | Real |

The script's one-line `--summary` already prints at every session start (and on push, where a
pre-push hook runs it), so quick mode is mostly for reading the full report behind that line. Use
**full mode** before a `review.md` pass, after a batch of large code changes, or when something
feels off but the script is clean.

## Severity tiers (use these in the report)

Severity reflects which of the five qualities (`.claude/context/engine/specs/wiki.md`
§ Maintenance discipline) the finding compromises.

| Tier | What | Examples | Default action |
|---|---|---|---|
| **critical** | Wiki contradicts current code; agents would write incorrect code | Invariant inversion; renamed function still cited as canonical; status string that no longer exists | ingest revise, now |
| **high** | Source moved/renamed, or signature drifted | Script `BROKEN` on a `sources:` path or inline ref; model field removed | ingest patch |
| **medium** | Past freshness window, oversized, bounded section overflowed, overlap | Script `WARN` on freshness / line target / list caps; pitfalls > 7; conflicting pages | Revise or split via ingest; or a prune candidate |
| **low** | Hygiene | Typo'd slug; page missing from `index.md`; `related:` slug that doesn't exist | Auto-fix during lint |

Lint classifies and reports. The user (or the follow-up workflow) decides on medium and above.

## Procedure

### 1. Mechanical pass — run the script

```bash
node .claude/context/engine/scripts/context-health.mjs --scope wiki          # grouped report, fix command per finding
node .claude/context/engine/scripts/context-health.mjs --scope wiki --json   # + metrics.wiki: pages, stale90, staleRatio
```

It covers sources, inline refs, `[[…]]` body cross-refs, frontmatter keys, status vocabulary,
freshness, edited-after-`last_verified`, line and list caps, `log.md` heading form and index
length; thresholds live in `.claude/context/budgets.json`. Do not re-derive any of it by hand. Map
`BROKEN` → high (or critical if the cited thing is load-bearing), `WARN` → medium. Heuristic
symbol misses can be false positives — triage, don't trust blindly.

Healthy baseline: zero `BROKEN`, `staleRatio` ≤ 0.25. Anything outside that goes in the report.

### 2. Structural checks the script does not make

- **Index coverage and status.** Every page under `entities/`, `flows/`, `subsystems/`,
  `workflows/` is listed in `index.md`, with the same status as its frontmatter. Orphans:
  `comm -23 <(cd .claude/wiki && ls {entities,flows,subsystems,workflows}/*.md | sort) <(grep -oE '[a-z]+/[a-z0-9-]+\.md' .claude/wiki/index.md | sort -u)`
- **Frontmatter `related:`** — each `type:slug` names an existing page (the script only resolves
  `[[…]]` in the body).
- **Slug matches filename.**
- **Bounded sections** — `Common pitfalls` and `Invariants` ≤ 7 entries.

### 3. Semantic checks (LLM)

- **Contradictions.** Compare pages that share `related:` refs; flag directly contradictory
  claims about the same flow or entity.
- **Duplication.** Two pages with > 40 % overlap on a concept → consolidate candidate; a page
  restating a `CLAUDE.md` / `.claude/rules/` rule instead of pointing at it → patch candidate.
- **Code-vs-wiki spot checks.** For each entity/subsystem page in scope, open the first
  `sources:` file and confirm one specific claim still holds (field exists, signature matches,
  transition implemented). For flow pages, walk **Sequence** and confirm each cited `file:line`
  is still in the same function. A failed spot check is critical or high.
- **Stale narrative.** Paths still resolve but the behaviour described changed — the class of
  drift only reading catches.

### 4. Report

```
## Wiki lint report — YYYY-MM-DD
Script: <summary line> · pages=<N> · staleRatio=<x>
### Critical (N) / High (N) / Medium (N) / Low (N)
- <page> — <finding> → <follow-up command>
```

### 5. Fix now vs flag

Apply directly: add orphans to `index.md`; fix a dead `[[…]]` that is a typo of a real slug; fix a
`related:` typo; bump `last_verified` on pages whose spot check passed (only those).

Flag to the user first: marking a page `stale`, splitting, resolving contradictions (which side
is right?), deleting anything (that is `prune.md`).

### 6. Log the lint

Append to `log.md` (heading form `## [YYYY-MM-DD] op | summary`):

```
## [YYYY-MM-DD] lint | <N findings, M auto-fixed>
- metrics: pages=<N>, staleRatio=<x>, critical=<N>, high=<N>, medium=<N>, low=<N>
- changed: <files auto-fixed, or none>
```

### 7. Hand off

- Critical → `/context-loop:wiki ingest <page>` (revise)
- High → `/context-loop:wiki ingest <page>` (patch)
- Medium, oversized / stale → `/context-loop:wiki review`
- Medium, dead content → `/context-loop:wiki prune <page>`

Lint only detects; the follow-up is explicit. Re-run step 1 after any fix — your pages must come
back clean.
