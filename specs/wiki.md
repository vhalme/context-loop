# Wiki spec

The wiki (`.claude/wiki/`) is an LLM-maintained knowledge layer for a codebase. It gives AI
assistants (Claude Code and its subagents) **fast, structured access** to the architecture, domain
concepts and operational workflows of the project, without re-deriving the same understanding from
raw source on every task.

It is modelled on Karpathy's three-layer wiki pattern (raw sources -> wiki -> schema). This file is
the **schema**; a repo's `.claude/wiki/README.md` points here and adds only what is repo-specific.

> **Primary objective of any maintenance action** (ingest, prune, revise, review, lint follow-up):
> agents working with the project afterward are more *informed*, *effective*, *reliable*,
> *concise* and *deterministic*. The operational gate is [Maintenance discipline](#maintenance-discipline)
> below; every wiki edit must pass it. The same gate applies to the auto-loaded canonical docs
> maintained by `/context-loop:update-knowledge`.

---

## The three layers

| Layer | Lives in | Owner |
|---|---|---|
| Raw sources | The codebase (source, schema, migrations, tests) and human-authored docs (`CLAUDE.md` tree, `.claude/rules/`, any docs directory) | Humans + LLM (code edits) |
| Wiki | `.claude/wiki/` | LLM (curated, never authoritative on its own) |
| Schema | This spec + `.claude/wiki/index.md` + `.claude/wiki/log.md` | LLM, structurally stable |

**Key rule:** the wiki **never replaces** canonical sources. It *points at them*. If a wiki page
contradicts the code or a `CLAUDE.md`, the code/`CLAUDE.md` wins, and the wiki page is the bug.

---

## Why it exists alongside the other docs

- `CLAUDE.md` tree: schema-level overview of each workspace. What loads when is stated once, in
  root `CLAUDE.md` § Context system.
- `.claude/rules/`: short, declarative, always-loaded rules.
- `.claude/knowledge/<agent>.md`: per-agent curated playbooks (`.claude/context/engine/specs/playbooks.md`).
- `.claude/agents/<agent>.md`: lean agent definitions that pull depth via recall + playbook index.

The wiki adds three things these don't provide:

1. **Domain-oriented synthesis.** The other docs are organized by *location* (which file, which
   workspace). The wiki is organized by *concept* (`order`, `user`, a payment flow). "Explain how
   X works end-to-end" is answered without spelunking.
2. **Cross-references.** Every page links to related pages and to canonical source files. The web
   of `[[type:slug]]` links + `path/to/file.ts:line` references lets the LLM walk from a question
   to the relevant code in 1-2 hops.
3. **Operational workflows.** `workflows/` documents *how* the LLM approaches recurring tasks in
   this repo. They live with the wiki because they reference it.

---

## Directory layout

```
.claude/wiki/
├── README.md       # points at this spec; repo-specific notes only
├── index.md        # catalog of every page: one-line summary, status
├── log.md          # append-only chronological record of wiki changes & ingests
├── workflows/      # repo procedures that use the wiki (e.g. feature-design, debugging)
├── entities/       # core domain concepts, one page per concept
├── flows/          # end-to-end journeys spanning multiple files/services
└── subsystems/     # cross-cutting modules (auth, payments, ...)
```

The core operations (ingest, query, lint, prune, review) ship as the `/context-loop:wiki` skill;
`workflows/` holds only the repo's own procedures. Add a new directory only when a category has at
least 3 pages; until then, place orphan pages in the closest existing category.

---

## Page conventions

Every page starts with a frontmatter block:

```yaml
---
type: entity | flow | subsystem | workflow
slug: order                   # matches filename (no extension)
status: stable | draft | stub | stale
sources:                      # canonical files this page synthesizes
  - packages/core/src/orders/model.ts#Order
  - apps/web/app/checkout/actions.ts
related:                      # other wiki pages; use [[type:slug]] anywhere
  - flow:checkout
  - entity:user
last_verified: YYYY-MM-DD     # date the page was last reconciled against the code
---
```

After the frontmatter, page bodies follow type-specific structures (defined by `/wiki ingest`).

### Cross-reference syntax

- `[[entity:order]]`: link to another wiki page (slug matches filename)
- `path/to/file.ts:42`: a specific line in the codebase
- `path/to/file.ts#symbol`: a symbol (function, model, component)

These are not markdown links; they are a recognizable, greppable convention the LLM resolves at
query time, and the health check verifies. Use them liberally. Tracks add the `track` type
(`[[track:NNN-slug]]`).

### Page status

- **stable**: verified against current code within `stableMaxAgeDays` (30); safe to cite
- **draft**: newly written, not yet verified
- **stub**: placeholder; only frontmatter and a TODO list exist
- **stale**: known out of date; do not cite without re-verifying

Update `status` and `last_verified` whenever you touch a page.

---

## Page sizing & bounded sections

Bloat is the wiki's main failure mode. Bounds force splits and consolidations before growth
dilutes clarity. Thresholds live in `.claude/context/budgets.json` (`wiki.*`); defaults:

| Page type | Target | Hard cap |
|---|---|---|
| `entity`    | 80-200 lines  | 300 |
| `flow`      | 100-300 lines | 400 |
| `subsystem` | 100-200 lines | 300 |
| `workflow`  | 100-250 lines | 350 |
| `index.md`  | < 200 lines (the harness truncates entries past ~200) | 200 |

Hitting the hard cap is an automatic `split` or `consolidate` trigger, never "append and hope".

| Section | Max entries | Rule when exceeded |
|---|---|---|
| `sources:` frontmatter | 8 | Page is doing too much: split, or drop refs the body doesn't cite |
| `related:` frontmatter | 8 | Same |
| Common pitfalls | 5-7 | Rotate: when adding, decide what to displace. Pitfalls that no longer reflect current code are removed, not kept for history |
| Invariants | 5-7 | Same: keep the load-bearing ones |
| Inline code blocks | as few as possible | Cite code (`path/file.ts#symbol`); paste only when the snippet teaches what the path won't |

**Replace, don't append.** When a section is wrong because the world changed, rewrite it. Never
add "as of <date>, this is now ..." lines. The wiki documents *current truth*; git history
records *when truth changed*.

**Cite, don't quote.** When something is in the code, cite it. The wiki is a synthesis layer,
not a mirror.

---

## Core operations

All run via `/context-loop:wiki <op>` (short: `/wiki <op>`).

| Operation | Purpose | Cadence | Effect |
|---|---|---|---|
| `ingest` | Fold new info into the wiki (incl. `/groom` promotions) | After a non-trivial code change | Writes |
| `query`  | Answer a question from the wiki | Per question | Read-only |
| `lint`   | Detect drift, bloat, contradictions | Weekly or pre-review | Read-only report |
| `prune`  | Remove dead / low-value content | After lint, or when the wiki feels heavy | Deletes |
| `review` | Strategic re-pass: is each page still earning its keep? | Monthly, or post-major-release | Restructures |

**Lint and prune are paired.** Lint *detects*; it doesn't delete. Prune is the only operation
that removes content, so every removal is intentional.

## Update modes

Classify the change first. Mixing modes confuses the diff and tempts append-style bloat.

| Mode | When | Effect |
|---|---|---|
| **patch** | Single fact correction, status flag, broken cross-ref | Inline edit, bump `last_verified` |
| **revise** | A section is wrong because the world changed | Rewrite the section (replace, don't append); bump `last_verified` |
| **add page** | A new concept passes the gate AND has no natural home in an existing page | New file from the type template; add to `index.md`; log it |
| **split** | A page exceeded its size budget along a natural seam | Move sections to a new page; update cross-refs and index |
| **consolidate** | Two pages overlap; one is dominant | Merge into the dominant page; delete the other; update cross-refs and index |
| **retire** | A concept no longer exists in code | `status: stale`; remove from the index's main listing; delete after ~30 days |

`/wiki ingest` selects the mode with a decision tree.

---

## How the LLM uses the wiki

1. **Look at `index.md` first.** Scan the catalog for relevant slugs.
2. **Read the matching page.** Pages are short and dense with cross-references.
3. **Follow `[[...]]` links** to related entities/flows/subsystems as needed.
4. **Drop down to `sources:` files** only when the page is insufficient.
5. **If you learned something the wiki should have told you,** run `/wiki ingest`.

Wiki sections are also indexed into the recall store, so `/context-loop:recall` surfaces them
alongside playbooks, tracks and past sessions. **Subagents** start with that tiered recall and
their playbook's navigation index (`.claude/agent-protocol.md`); the wiki is where they go for
cross-cutting context (a flow that spans workspaces, an entity that touches several subsystems).

---

## What the wiki does NOT contain

- **Code.** Snippets for illustration only; the canonical version is in `sources:`.
- **Long prose.** A page past its hard cap is split.
- **Per-agent learnings.** Those live in `.claude/knowledge/<agent>.md`.
- **In-progress task state.** Use tracks (`.claude/tracks/`) or task tools.
- **Speculation.** Plans and "we should" items belong in tracks or the issue tracker.
- **Duplicated canon.** The wiki *summarizes and indexes*; every architectural rule is stated
  once, in `CLAUDE.md` or `.claude/rules/`.

---

## Log format

`log.md` is append-only, newest at the bottom. The consistent prefix is machine-parseable:

```
## [YYYY-MM-DD] <op> | <summary>
- changed: <file>, <file>
- reason: <one sentence>
- by: <human handle or "auto">
```

`<op>` is `bootstrap` (structure created/restructured), `ingest`, `lint`, `revise`, `patch`,
`split`, `consolidate`, `prune` or `retire`. Never rewrite past entries.

---

## Maintenance discipline

The wiki rots without active care AND bloats without active restraint. Both kill its utility. One
gate filters both failure modes.

### The gate (apply before every write)

> **"Will an agent doing typical project work be more *informed*, *effective*, *reliable*,
> *concise*, or *deterministic* after this update, without becoming less of any of these?"**

Gain at least one. Sacrifice none. If both halves aren't a confident yes, skip: *doing nothing is
a valid outcome*.

### The five qualities

| Quality | What it means for an agent | Update that increases it | Update that decreases it |
|---|---|---|---|
| **Informed** | Has the right facts when it needs them | Add a load-bearing fact it would otherwise miss; correct a wrong one | Omit a real invariant; leave a stale fact in place |
| **Effective** | Acts without re-deriving understanding from source | Synthesize a flow end-to-end; add a cross-ref that shortcuts to the right page | Add info that's true but not actionable; scatter related info across pages |
| **Reliable** | Doesn't make confident mistakes; respects invariants and pitfalls | Codify an invariant; document a pitfall it would otherwise hit | Drop a pitfall that's still possible; leave an invariant tacit; let two pages contradict |
| **Concise** | Fewer tokens to the same correct outcome | Cross-link instead of duplicating; cite instead of prose; remove dead content | Append "as of <date>" history; paste code; duplicate a rule; bloat past budget |
| **Deterministic** | Consistent outputs across sessions and agents | Pick one approach and document it; resolve ambiguity; codify the canonical pattern | Document "X or Y" without picking; leave two valid-looking paths; allow code/claim drift |

**The first three are gains** an update can deliver. **The last two are constraints** it must
respect. Karpathy's growth-oriented pattern doesn't constrain; this one does, because auto-loaded
bloat compounds across every session and wiki drift erodes trust. `/wiki ingest` and
`/update-knowledge` both operationalize this gate.

### Non-negotiable rules

- **Every non-trivial change to the code or `CLAUDE.md`** triggers a wiki-worthiness check via
  `/wiki ingest`. The check may decide *no update*; that's valid.
- **Every claim of current behaviour** must be checkable against a `sources:` file. Untraceable
  claims are deleted or qualified, not left.
- **Every page touched bumps `last_verified`**, and only after actually re-checking it.
- **Every wiki write appends to `log.md`**, one line per change.
- **Every removal** goes through `/wiki prune`, never as a side effect of an ingest.

### Preferences when in doubt

- Fewer, denser pages over many thin ones
- Cross-references over duplication
- Pointing at code over describing code
- Marking a page `stale` over silently leaving it wrong
- A prune pass over leaving dead content "for history"

### Bloat indicators

- A page approaches its hard cap: consider `split`
- A pitfalls section grows beyond 7: rotate
- Two pages overlap > 40% on a concept: `consolidate`
- A page's `sources:` exceed 8: scope too wide, `split`
- A page not read or cited in 6 months: `/wiki review` candidate

`node .claude/context/engine/scripts/context-health.mjs --scope wiki` checks citations, symbols,
budgets, status vocabulary, freshness and edited-after-verified mechanically.

### What success looks like

- "How does X work?" is answered from the wiki in one or two page reads
- Bug-fix sessions cite a pitfall bullet that warned them in advance
- New features extend existing entity/flow pages cleanly because the structure was right
- Total wiki line count stays roughly stable as the project grows, *because pruning happens*
