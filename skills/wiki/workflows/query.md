# Workflow: Query

When the user asks a question — about the architecture, how a flow works, where something lives,
why something behaves the way it does — answer from the wiki first, then verify against code.

## Procedure

### 1. Decompose the question into concepts

"How does an order get paid?" → **order**, **payment**, **invoice**.
"Why isn't the customer getting a confirmation?" → **order**, **notification**, the triggering
**status transition**.

### 2. Find candidate pages

Two entry points; use both when the question is fuzzy:

- **The index** — `.claude/wiki/index.md` is short; scan it for the concept slugs
  (`grep -i "<concept>" .claude/wiki/index.md`).
- **Recall** — `/context-loop:recall "<question>"` (or
  `node .claude/context/engine/scripts/knowledge-recall.mjs "<question>"`), when the knowledge
  store is enabled. Results come back tiered: **wiki** (canon) → **playbook** (curated) →
  **track** (intent) → **episodic** (raw past sessions). Wiki hits name the page and `##`
  section; `--layer wiki` restricts to the wiki, `--surface <agent>` keeps only that agent's
  playbook in the playbook tier.

### 3. Read the candidate pages

Read the matching pages (they're short) and follow `[[…]]` cross-refs the page marks as relevant.
For per-surface detail, the page points at canon — the workspace `CLAUDE.md` and its pulled
sibling docs.

### 4. Check freshness

`last_verified` older than 90 days, or `status` `draft` / `stale` → treat the claims as
**hypotheses**; verify against `sources:` before relying on them. Playbook and episodic hits are
leads of lower trust — verify those too.

### 5. Drop down to source when needed

If the page doesn't answer fully, or you need a current line / signature / actual code:

- read the files in `sources:`; grep for symbols the page names;
- for runtime or DB state, use whatever read-only tooling the repo provides;
- delegate workspace-scoped digs to the owning dev agent, if the repo defines one.

### 6. Synthesize the answer with citations

Cite wiki pages and source files:

> An order creates its invoice on payment success (see `[[entity:invoice]]` and
> `packages/core/src/orders.ts#confirmOrder`)…

If a recall hit materially helped, credit it:
`node .claude/context/engine/scripts/knowledge-recall.mjs --credit <id,id>` (feeds
`/context-loop:groom` promotion).

### 7. If you found a gap, ingest

Meaningful source reading to answer the question = the wiki has a gap. Add the insight to an
existing page (preferred) or, if reusable and it passes the two-strikes rule, a new page — via
`ingest.md`. Bump `last_verified` only on pages whose claims you actually re-verified.

## Quick patterns

| Question shape | Where to look first |
|---|---|
| "What is X?" (concept) | `entities/` |
| "How does X happen end-to-end?" | `flows/` |
| "How does the X module work?" | `subsystems/` |
| "Where is X handled?" | the matching entity/flow page, then its `sources:` |
| "Why does X behave this way?" | the page's **Invariants** / **Common pitfalls** |
| "Where does effort X stand?" | `.claude/tracks/index.md` (generated) → the track's **Resume here** |
| "What changed about X recently?" | `git log` first, then `log.md` for wiki-recorded changes |

## Anti-patterns

- **Quoting the wiki without verifying** anything load-bearing (auth checks, money math, status
  logic).
- **Ignoring the wiki and grepping source for everything.** Try the wiki and recall first.
- **Treating an episodic hit as fact.** It's a lead from a past session; the code may have moved.
- **Answering against the wiki without resolving the contradiction.** If the wiki is wrong,
  ingest the correction.
