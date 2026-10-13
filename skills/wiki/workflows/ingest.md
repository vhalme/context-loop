# Workflow: Ingest

Procedure for folding new information into the wiki. **Decision-led** — most of the work is
deciding whether to ingest at all, and in what mode. Ingestion that fails the gate
(`.claude/context/engine/specs/wiki.md` § Maintenance discipline: gain informed / effective /
reliable, sacrifice neither concise nor deterministic) is bloat. Skipping is a valid outcome.

## Where ingest requests come from

- **A code change you just shipped** — or `/context-loop:wiki ingest <scope>` on demand.
- **`/context-loop:context sync`** — walks the commits since the cursor and dispatches
  wiki-ingest items here.
- **Playbook promotions** — `/context-loop:groom <agent>` never edits the wiki; it *proposes*
  outbound promotions as exact `/context-loop:wiki ingest <page> — <what>` commands for playbook
  entries that are authoritative and cross-cutting. Treat each as an ingest request: re-check the
  claim against the cited code, apply the gate, pick the mode like any other change.
- **A lint finding** — critical → revise, high → patch (`lint.md` § Hand off).

## Decision tree: is this wiki-worthy?

### YES — ingest if ANY of these is true

1. **Invariant changed.** *(Gains: informed, reliable.)* A rule a page documents is no longer
   true, or a new load-bearing rule is. *E.g.* a status value is added to the status constants; a
   new auth guard becomes required.
2. **New domain concept** without a clean home. *(Gains: informed, effective.)* *E.g.* a new
   entity; a new external integration; a new subsystem.
3. **Contract changed** for something cited in `sources:`. *(Gains: informed, reliable.)* *E.g.*
   an action or handler signature; an exported helper renamed; an API response shape; a
   state-machine transition.
4. **Hard-earned gotcha.** *(Gains: reliable.)* Test: "if the wiki had said this, the bug
   wouldn't have happened." Goes into the page's **Common pitfalls** (bounded).
5. **Source moved or renamed.** *(Preserves: concise, deterministic.)* Update `sources:` / inline
   refs; usually no prose change.
6. **Ambiguity resolved.** *(Gains: deterministic.)* Two pages contradicted, or a page said
   "X or Y" — the canonical pattern is now settled.

### NO — skip if ANY of these is true

1. Bug fix without a new gotcha — git history is enough.
2. Pure refactor — same behaviour, same contract (only `sources:` may move).
3. One-off task — migration, data fix, temporary script.
4. Performance / cosmetic change with no behavioural impact.
5. Documentation-only change — don't recursively document doc changes.
6. Test addition for existing behaviour, unless it exposed an undocumented invariant.
7. Dep bump, lint fix, formatting.
8. WIP / experimental / unmerged — wait until landed.

### Tie-breakers

- **Two strikes for new pages.** Don't create a page on the first occurrence of a concept; list
  it under "Planned" in `index.md`. When it comes up a second time it has earned its page.
- **Pitfalls are bounded.** At 7 entries, adding one means displacing one.
- **When in doubt, lint first.** `lint.md` on the affected pages often shows whether it's a
  patch, a revise, a split, or nothing.
- **Canon or wiki?** A declarative rule every session needs belongs in `CLAUDE.md` /
  `.claude/rules/` via `/context-loop:update-knowledge`; the wiki then points at it. Do both only
  for genuinely cross-layer changes (canonical first).

## Choose the update mode

Modes are defined in `specs/wiki.md` § Update modes. Picking between them:

- **patch vs revise** — under ~5 lines of edits is a patch; a section rewritten in place is a
  revise.
- **revise vs add page** — if the change makes the page's scope incoherent, split out a new page;
  if it fits the scope, revise.
- **split / consolidate** — a page over its line target at a natural seam / two pages overlapping
  > 40 %.
- **retire** — delegate to `prune.md`; ingest never deletes.

## Procedure

### 1. Scope the change

Name the concept(s) that changed in plain language — not file names. "Added order cancellation
flow." "Fee resolution allows a per-product tier."

### 2. Apply the gate

Walk the decision tree. If skip, **log the skip** (step 6, summary `skipped — <reason>`) so the
decision is recoverable, and stop.

### 3. Find affected pages

```bash
node .claude/context/engine/scripts/knowledge-recall.mjs "<concept>" --layer wiki   # semantic, per ## section
grep -rli "<concept-keyword>" .claude/wiki                                         # literal fallback (no store)
```

Decide the mode per matching page.

### 4. Execute the mode

- **patch / revise:** edit in place — replace, don't append; bump `last_verified` only after
  re-checking the page's claims.
- **add page:** create from the template below; add to `index.md`; cross-link from at least one
  existing page.
- **split:** create the new page; move sections; update cross-refs both ways; update `index.md`.
- **consolidate:** move the keep-worthy content into the dominant page; delete the other; repoint
  every cross-ref; update `index.md`.

### 5. Update the index

`index.md` lists the pages that exist now, with their current status. Reflect every
add/remove/status change.

### 6. Log it

Append to `log.md`. The heading form `## [YYYY-MM-DD] op | summary` is machine-checked (ops:
`bootstrap`, `add`, `add page`, `ingest`, `revise`, `patch`, `lint`, `prune`, `review`, `sync`,
`retire`):

```
## [YYYY-MM-DD] ingest | <one-sentence summary>
- <page>: <what changed and why — cite the commit, track or groom proposal>
```

### 7. Verify

- `node .claude/context/engine/scripts/context-health.mjs --scope wiki` — touched pages must show
  no findings (sources resolve, cross-refs resolve or are Planned, under line/list caps,
  `last_verified` not older than the edit).
- Then the judgement checks the script can't make: every claim traces to a `sources:` file;
  **Common pitfalls** ≤ 7; no "X or Y" left where the canonical pattern is known; the gate still
  holds.

No re-index step: when the knowledge store is enabled, `knowledge-curated.mjs` runs detached at
the next session start and re-embeds every wiki `##` section whose text changed, so
`/context-loop:recall` serves the new content from then on.

## Page templates by type

Every page opens with the same frontmatter (`type` is `entity` | `flow` | `subsystem`):

```markdown
---
type: <type>
slug: <name>
status: draft
sources:
  - <schema / entry-point file>
  - <where its logic lives>
related:
  - <type:slug>
last_verified: <date>
---
```

**Entity** — `# <Entity name>`, one-paragraph definition, then:

```markdown
## Schema essentials        (point at the schema; do not duplicate)
## Status lifecycle         (if applicable — states, transitions, terminal states)
## Invariants               (max 5–7; each checkable in code)
## Related entities / flows
## Common pitfalls          (max 5–7, rotate)
```

**Flow** — `# Flow: <Flow name>`, one-paragraph what-and-why, then:

```markdown
## Trigger / Pre-conditions
## Sequence        (numbered; each step cites `path/file.ts:LINE`)
## Side effects    (DB writes, emails, webhook calls)
## Failure modes   (table: what goes wrong, how recovered)
## Related
## Common pitfalls (max 5–7)
```

**Subsystem** — `# Subsystem: <Name>`, what it does and where its boundary is, then:

```markdown
## Key files / Entry points / Configuration
## Invariants      (max 5–7)
## Related
## Common pitfalls (max 5–7)
```

## Anti-patterns

- **Ingesting because something changed.** The trigger is "will this help the next agent," not
  "did code change."
- **Appending instead of rewriting.** "As of <date>, …" is the bloat signature.
- **Pasting code.** The wiki cites; the code base holds.
- **Adding an 8th pitfall without removing one.** Pitfalls rotate.
- **Creating a page on the first occurrence.** Wait for the second.
- **Narrating bug fixes.** Git is for that.
- **Applying a groom promotion verbatim.** A playbook entry is surface-scoped and verified once;
  re-check it and rewrite it into the page's voice.
- **Bumping `last_verified` without re-checking sources.** Defeats the freshness signal.
