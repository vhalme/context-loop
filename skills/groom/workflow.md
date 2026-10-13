# Workflow: Groom a playbook

Active curation of a single agent's playbook (`.claude/knowledge/<agent>.md`). Grooming is the
**counter-loop** that keeps the playbook from rotting: it dedupes, deletes stale entries,
rebuilds the navigation index, and surfaces promotion candidates. Trust ladder:
`.claude/context/engine/specs/playbooks.md`.

Grooming is **periodic, not per-task.** Per-task capture happens in the agent's gated
retrospective (`kb:` markers); grooming is the deliberate maintenance pass over the result.

## How this serves the gate

Grooming is justified by **concise** and **deterministic** gains (the five-qualities gate,
`.claude/context/engine/specs/wiki.md` § Maintenance discipline). Every removal answers: *after cutting this,
are agents more concise (less to read) or more deterministic (less conflicting/ambiguous),
without becoming less informed/effective/reliable?* If a cut would lose a still-relevant
lesson, revise the entry instead of deleting it.

## When to run

- **Threshold** — the health check (`context-health.mjs --scope playbooks`) names playbooks over
  budget (`.claude/context/budgets.json`); that nag is the normal trigger. An agent may *suggest*
  a groom when its playbook feels heavy; it does not groom mid-task.
- **After a refactor** — code changed enough that documented patterns may be stale.
- **On demand** — `/context-loop:groom <agent>`, scoped to one agent's playbook.

## What to groom

- **Duplicate / overlapping entries.** Two entries teaching the same lesson → merge into the
  clearer one; keep the date of the earliest occurrence.
- **Stale entries.** An entry whose Problem the current code makes impossible, or whose Solution
  no longer matches the code. *Test: can this still happen against current code?* If no →
  delete. If the lesson survives in changed form → revise.
- **Superseded entries.** A later, better entry covers the same ground → remove the older.
- **Promotion candidates.** A curated entry that is authoritative *and* cross-cutting (other
  surfaces would benefit) → flag it for promotion to canon (`/context-loop:wiki ingest`, or a
  `CLAUDE.md`/`.claude/rules/` edit via `/context-loop:update-knowledge`). Surface it; don't
  promote silently.
- **Bloated sections.** A section grown past usefulness → keep the load-bearing entries, rotate
  out the lowest-value ones (score: could this mistake still be made?).

## What NOT to groom away

- A lesson still reachable against current code, even if rarely hit. The playbook teaches.
- A **dead-end / rejected-approach** entry — its whole job is to stop a future agent re-trying
  the wrong thing. Recurrence isn't the test; *would re-trying it waste time?*
- An entry that should be canon — **promote** it, don't just delete it.

## Script assistance

All under `.claude/context/engine/scripts/`:

- `context-health.mjs --scope playbooks` — mechanical findings (budget, duplicate sections,
  dated `##` entries, missing `tags:`, broken citations).
- `knowledge-recall.mjs --candidates <agent>` — **inbound** promotion candidates: episodic
  records on this surface that recur across sessions or were credited, minus what the playbook
  already covers. Written as v2 entries when they pass the gate; sources then credited with
  `--credit`. Needs the optional store (`.claude/context/project.json`).
- `playbook-index.mjs <agent>` — regenerates the navigation index (`--check` verifies it). The
  index is generated, never hand-maintained.
- Entries must be in the v2 format (`tags:` line) — grooming migrates the ones that are not.

## Procedure

1. **Read the whole playbook** section by section against "What to groom".
2. **Classify each candidate** — category, confidence it's dead, cost of being wrong. Low
   confidence or high cost → leave it and note it for a human; don't cut unilaterally.
3. **Verify stale candidates against current code** before deleting — open the cited
   `path/file.ts#symbol`; the code is the authority.
4. **Apply** — merge/delete/revise high-confidence, low-cost candidates.
5. **Regenerate the navigation index:**
   `node .claude/context/engine/scripts/playbook-index.mjs <agent>`.
6. **Record promotions** — for each promotion candidate, note what should go to canon and where,
   so the follow-up `wiki ingest` or canon edit is unambiguous. Curated → canon is always
   proposed, never applied inside a groom.

After a batch of grooms the orchestrator (not the groom) runs `knowledge-curated.mjs` and
`context-health.mjs --snapshot` once.

## Anti-patterns

- Shortening for its own sake — length isn't the enemy; *unjustified* length is.
- Deleting a dead-end entry because "no one re-tried it lately."
- Deleting a cross-cutting lesson instead of promoting it to canon.
- Grooming and per-task capture in the same pass — keep produce and curate separate.
