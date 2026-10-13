# Playbook spec

`.claude/knowledge/<agent>.md` is each dev agent's **playbook**: its curated, growing,
surface-specific operating memory. It is where an agent records what it learned solving real
problems on its surface, so the next session starts informed instead of re-deriving the same
understanding.

This is the **spec** for that layer, the playbook analog of `.claude/context/engine/specs/wiki.md`.
It defines the playbook's role, its structure, and the **trust ladder** that governs how knowledge
moves between layers. `/context-loop:groom` enforces it.

> The point is not to *accumulate* knowledge but to accumulate -> curate -> promote it, so the
> store gets **more trustworthy over time** rather than rotting. Accumulation without curation is
> the failure mode this layer is designed against.

---

## The three knowledge layers an agent sees (the trust ladder)

| Layer | Lives in | Character | How the agent uses it |
|---|---|---|---|
| **episodic** | the vector store (`knowledge-recall.mjs`) | noisy, auto-captured from `kb:` markers, semantic, **shared across all agents** | query at task start for *leads*; verify before relying |
| **curated** | `.claude/knowledge/<agent>.md` | deliberate, verified, **surface-specific**, navigable | read the nav index at task start; append after non-trivial work |
| **canonical** | `CLAUDE.md` tree, `.claude/wiki/`, `.claude/rules/` | authoritative, the source of truth | the spec: trust it over memory |

**Trust increases as you climb. Authority is the reverse: canon always wins.** If a playbook entry
contradicts current code or canon, the code/canon wins and the entry is the bug: correct or
delete it.

### How an agent consumes the ladder

All layers are indexed in **one** vector store, labelled by source: `wiki` (promoted),
`playbook:<agent>` (verified), `track` (verified), `session-transcript` (raw). At task start an
agent runs **one** query,
`node .claude/context/engine/scripts/knowledge-recall.mjs "<topic>" --surface <agent>`, gets
results grouped by tier, then reads only the **generated navigation index** of its playbook, never
the whole file. Full entries are opened by heading when the index or a hit points at them. Hits
that helped are **credited** (`--credit <id,id>`): raw -> verified, and the credit count is what
`/groom` uses to pick promotion candidates. The curated index is refreshed by
`knowledge-curated.mjs` (detached, at session start; only changed units re-embed). Without the
episodic store (`"store": false` in `.claude/context/project.json`) the agent reads the nav index
and canon directly.

### Promotion (knowledge earns its way up by recurring + verifying)

- **episodic -> curated.** A recall lead that proves correct and recurs is written up as a
  playbook entry (load-bearing knowledge must not live only in the noisy store).
- **curated -> canonical.** An entry that is authoritative *and* cross-cutting (other surfaces
  would benefit) is **proposed** for promotion: a `/wiki ingest` for a flow/entity/subsystem, or a
  `CLAUDE.md` / `.claude/rules/` edit via `/update-knowledge`. Promotion to canon is always
  *proposed, never silent*; changing what every session loads is a deliberate act.

### Demotion / deletion

Anything current code contradicts is corrected or removed, during the gated retrospective when an
agent notices it, or during a grooming pass. Stale knowledge that misleads is worse than none.

### Where the orchestrator sits

The main session (orchestrator) has **no playbook of its own, by design.** Its knowledge is
cross-cutting, so its curated layer is the **shared canon** plus the user-level memory store
(`~/.claude/projects/<repo>/memory/`, with `MEMORY.md` as its index and its own grooming). It
emits `kb:` markers like any agent and is the one that *performs* promotion to canon (`/wiki
ingest`, canon edits): it sits at the top of the ladder, not on a rung. **Do not create an
`orchestrator.md` playbook**: cross-cutting knowledge belongs in canon, promoted, committed and
shared, not in a private silo.

---

## Playbook structure

Every `.claude/knowledge/<agent>.md` has the same shape:

1. **Header**: one line saying whose growing memory this is, governed by this spec.
2. **Navigation index**: a **generated** block (`<!-- nav:begin -->` ... `<!-- nav:end -->`
   under `## Navigation index`), one line per entry (date, title, entities, track) grouped by
   section. Rebuilt by `node .claude/context/engine/scripts/playbook-index.mjs <agent>` after
   every entry added; the health check flags a stale block. This is what an agent reads at task
   start, so it must stay complete and cheap.
3. **Themed sections**: `##` buckets matching the agent's surface disciplines (e.g. *Auth &
   ownership*, *Test failures & fixes*, *Schema & migrations*, *Rejected approaches*). Entries
   are always `###` under a section, never a dated `##`.

### Entry format (v2)

```
### YYYY-MM-DD: <concise title>
tags: entities=order,user · files=apps/web/app/checkout/actions.ts · track=012
**Problem:** what went wrong / what was non-obvious
**Solution:** what actually worked
**Prevention:** how a future session avoids the friction (cite `path/file.ts#symbol`)
```

The `tags:` line is required and comes first. `entities` and `files` use the same vocabulary as
`kb:` markers (so one record shape flows through every layer; the entity nouns are listed in
`.claude/context/project.json`); `track` is optional. The nav index and the curated recall index
are built from it. Cite code (`path/file.ts:line` / `#symbol`); don't paste it. Keep entries dense
and self-contained, readable months later without the conversation, the same discipline as `kb:`
markers in `.claude/agent-protocol.md`. Size budgets (`playbooks.bytes`, `playbooks.entries`)
live in `.claude/context/budgets.json`; crossing one is the signal to run `/groom <agent>`.

---

## How knowledge gets in (the produce -> curate loop)

- **Produce.** During work, emit `kb:` markers at the moment of insight (they flow to the vector
  store at session end, including from subagents). After a *non-trivial* task, run the gated
  retrospective in your agent definition: add a curated entry for anything durable. Trivial tasks
  add nothing; silence is a valid outcome.
- **Curate.** `/groom <agent>` dedupes/merges entries, deletes stale ones (verified against
  current code), migrates entries to v2, regenerates the nav index, and surfaces promotion
  candidates in both directions: episodic -> curated (`knowledge-recall.mjs --candidates <agent>`:
  recurring or credited session records on the agent's surface, per `budgets.agents.surfaces`,
  not yet in the playbook) and curated -> canon (proposed `/wiki ingest` / `/update-knowledge`).
  This is the mandatory counter-loop; the health check nags when a playbook crosses its budget.

## The gate (apply before every entry)

Reuse the five-qualities gate from `.claude/context/engine/specs/wiki.md`: an entry earns its
place only if a future agent doing typical work on this surface would be more **informed**,
**effective** or **reliable** for it, *without* becoming less **concise** or **deterministic**.
Gain at least one; sacrifice none. Otherwise, don't write it.

## What the playbook does NOT contain

- **Canon.** Route maps, state machines, status lists, domain rules live in the `CLAUDE.md` tree
  / `.claude/rules/` / wiki and are pulled fresh. Point at them; don't copy.
- **Cross-cutting synthesis.** A flow that spans workspaces belongs in the wiki: propose a
  promotion instead of duplicating it per agent.
- **Code.** Cite it.
- **In-progress task state.** Use tracks or task tools.
- **Another surface's knowledge.** Shared insight is promoted to canon where every agent sees it,
  not copied between playbooks.
