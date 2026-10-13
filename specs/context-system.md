# Context system: how knowledge reaches, and stays fit for, every session

context-loop is the machinery that gives each Claude Code task the sharpest relevant context and
keeps that context correct as the code moves. This is the architecture overview; the per-layer
specs are `wiki.md`, `playbooks.md` and `tracks.md` beside it (`.claude/context/engine/specs/`).
The **one** statement of what loads when, for a given repo, lives in that repo's root `CLAUDE.md`
§ Context system; this page is the mental model behind it.

## The six layers

| Layer | Lives in | Written by | Curated by | Loaded |
|---|---|---|---|---|
| Canon | root + per-workspace `CLAUDE.md`, `.claude/rules/` | `/update-knowledge`, feature work | `/update-knowledge` within `budgets.json` | root + rules every session; a workspace's `CLAUDE.md` when its files are read |
| Pulled siblings | e.g. `apps/web/{TESTING,UI,PATTERNS}.md` beside a `CLAUDE.md` | same | same | on demand only |
| Wiki | `.claude/wiki/` | `/wiki ingest`, `/groom` proposals | `/wiki lint` -> `prune` -> `review` | on demand; indexed into recall |
| Playbooks | `.claude/knowledge/<agent>.md` | the agent's retrospective | `/groom <agent>` | nav index at agent task start; indexed into recall |
| Tracks | `.claude/tracks/` | `/track create` / `handoff` / `close` | the health check (status, staleness) | registry on demand; resume-heres indexed into recall |
| Episodic | local pgvector store (`project.json` `store`, default port 5434) | SessionEnd hook distils every session + subagent | `--credit`, `--candidates` -> `/groom` | via `/recall` only |

Skills are `/context-loop:<skill>`: `context`, `recall`, `groom`, `wiki`, `update-knowledge`,
`track`. User-level memory (`~/.claude/projects/<repo>/memory/`) sits beside these layers and holds
only what the repo cannot: who the user is and how they want to work. Anything the repo documents
is deleted from memory, not duplicated.

## Trust and authority

Trust rises episodic -> playbook -> wiki -> canon; authority runs the same way: canon always wins,
and a lower layer that contradicts the code is the bug. Knowledge moves **up** by recurring and
being verified: a credited or recurring episodic record becomes a playbook entry (inbound, in
`/groom`); an authoritative, cross-cutting playbook entry is **proposed** for the wiki or canon
(outbound, never applied silently: changing what every session loads is a human decision).

## Retrieval: one query, tiered

Wiki sections (per `##`), playbook entries (`source=playbook:<agent>`), track resume-heres and
episodic records sit in **one** store, labelled by `source` and `status` (`promoted` / `verified`
/ `raw`). `node .claude/context/engine/scripts/knowledge-recall.mjs "<topic>" --surface <agent>`
returns them grouped by tier with a status boost and recency decay; agents read that plus their
playbook's generated nav index, and open full entries by heading only when pointed at them. The
curated index refreshes detached at session start (`knowledge-curated.mjs`, SHA-upsert: only
changed units re-embed). Hits that helped are credited (`--credit <id,id>`: hits+1, raw ->
verified).

## Health: one signal, nag never block

`context-health.mjs` checks every layer mechanically in < 1 s: citations and symbols, budgets,
freshness, status vocabulary, edited-after-verified, generated-index drift, version claims,
workspaces without a `CLAUDE.md`, agent `maxTurns`; `--with-store` adds store counts. Its
`--summary` line prints at **SessionStart** (plugin hook) and, if the repo adds it, in its git
**pre-push** hook (`node .claude/context/engine/scripts/context-health.mjs --summary || true`),
with the fix command for the worst findings. `/context check` is the full report. Every threshold
lives in `.claude/context/budgets.json`. Curation workflows end with `--snapshot`, appending to
`.claude/context/health-history.jsonl`: the record of whether the system is actually improving.

## Engine and instance

The plugin is the **engine**: scripts, specs, skills, hooks. It names no repo; it resolves the
repo from `CLAUDE_PROJECT_DIR` / git / cwd and reads the **instance** only through
`context-config.mjs`. The instance is the repo's own `.claude/` tree plus two config files:

- `.claude/context/budgets.json`: every size/freshness threshold, agent surfaces, version claims.
  Its presence is what makes a repo an instance; hooks do nothing elsewhere.
- `.claude/context/project.json`: identity (project slug), the episodic store (container, volume,
  image, port, credentials, database, all derived from the slug when omitted; `"store": false`
  opts out, and no hook then starts Docker or writes a database), and the entity vocabulary the
  session distiller tags records with.

Each session start refreshes `.claude/context/engine`, a repo-local symlink to the installed
plugin (`engine-link.mjs`), so docs, agents and git hooks use one stable path:
`node .claude/context/engine/scripts/<script>.mjs`. `.claude/context/state.json` holds the
`/context sync` cursor (read by `/context status`).

## Invariants

1. **One statement per fact.** Loading model in root `CLAUDE.md`; budgets in `budgets.json`;
   identity, store and entity vocabulary in `project.json`; rules in `.claude/rules/`. Everything
   else points at them.
2. **Registries are generated, never hand-edited**: `tracks/index.md` (`tracks-index.mjs`),
   playbook nav blocks (`playbook-index.mjs`). The health check flags drift.
3. **Auto-loaded bytes are the scarce resource.** A workspace `CLAUDE.md` keeps compact tables;
   narrative goes to a pulled sibling or the wiki, leaving a one-line pointer.
4. **Curation verifies against code before it deletes.** Grooms and lint passes open the cited
   file; low-confidence cuts are listed for the human, not made.
5. **Promotion upward is proposed, not applied** by the layer below.
6. **The pipeline is keyless and local**: distillation via `claude -p`, embeddings via a local
   model; the store is optional (every hook exits 0 without Docker or without the opt-in).
7. **Engine vs instance.** A repo-specific value in an engine script is a bug: it belongs in
   `project.json` or `budgets.json`.

## Cadence

| When | What runs |
|---|---|
| Every session start | engine link; health summary; Docker + store check; curated re-index (detached) |
| Every session end | ingest of the session + its subagents |
| Agent task start / end | tiered recall + nav index / `kb:` markers, credits, v2 playbook entry |
| Every push (if the repo wires a pre-push hook) | health summary (warn-only) |
| Playbook over budget | `/groom <agent>` |
| After shipping something non-trivial | `/wiki ingest`; `/track handoff` or `close` |
| Weekly-ish | `/context sync` (catch canon + wiki up to commits since the cursor) |
| Wiki feels heavy / monthly | `/wiki lint` -> `prune`; `/wiki review` |

## Pitfalls

- **Writing without curating.** Every write path automated, no curate path ever run, is the
  failure mode this design exists to prevent. A new writer needs a matching curator and a health
  check.
- **Copying canon into a lower layer** (playbook, agent definition, memory): it drifts. Point.
- **Bumping `last_verified` without re-checking**: the health check cannot tell; the page lies.
- **Running the curated re-index or `--snapshot` from parallel agents**: the orchestrator runs them
  once after a batch (concurrent store writes).
- **Treating a recall hit as truth.** Episodic records describe the code as it was; verify.

## See also

- Specs: `wiki.md`, `playbooks.md`, `tracks.md` (this directory).
- The repo's `.claude/agent-protocol.md`: `kb:` markers, consult order, subagent final report.
