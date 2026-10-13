---
name: track
description: Durable, resumable tracks for multi-session work (.claude/tracks/) — create, resume, handoff, close, and regenerate the registry. Use for any effort that will outlive one session, at session start when .claude/tracks/index.md lists an active track for the work, and always run handoff before stopping work on a track.
argument-hint: "create <goal> | resume [id] | handoff [id] | close [id] | index [--check]"
allowed-tools: Read, Edit, Write, Bash(node:*), Bash(git:*), Grep, Glob
---
# /context-loop:track

Arguments: `$ARGUMENTS`

A **track** is the intent layer of the context system: one effort that outlives a session — its
goal, roadmap, current position and trajectory — persisted in `.claude/tracks/NNN-slug.md` so
any future session (or a parallel agent) picks it up exactly where the last one stopped. The
full model is `${CLAUDE_PLUGIN_ROOT}/specs/tracks.md`.

**Precondition.** No `.claude/context/budgets.json` → say the repo has no context-loop instance
yet (`/context-loop:context init` is planned) and stop.

## Subcommands

The first token of `$ARGUMENTS` is the subcommand; the rest names the track (`NNN` or
`NNN-slug`) or, for `create`, the goal. No track named → use the one the session is working on,
or ask, listing `active` rows from `.claude/tracks/index.md`.

| Subcommand | Procedure |
|---|---|
| `create` | `${CLAUDE_SKILL_DIR}/workflows/create.md` |
| `resume` | `${CLAUDE_SKILL_DIR}/workflows/resume.md` |
| `handoff` | `${CLAUDE_SKILL_DIR}/workflows/handoff.md` — run before ending work on a track, every time |
| `close` | `${CLAUDE_SKILL_DIR}/workflows/close.md` |
| `index` | `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracks-index.mjs"` regenerates `.claude/tracks/index.md`; `--check` exits 1 if it is stale; `--print` renders to stdout only |
| (none) | Show `.claude/tracks/index.md` and suggest `resume` for the active track that fits |

For a workflow: read the file, then follow its Procedure. Where it says
`node .claude/context/engine/scripts/<script>.mjs`, `node "${CLAUDE_PLUGIN_ROOT}/scripts/<script>.mjs"`
is equivalent.

## Anatomy (the contract every workflow maintains)

Frontmatter `id` (= filename), `title`, `status` (`proposed | active | blocked | paused | done |
abandoned`), `created`, `updated`, `worktree` (`null` or path/branch). Body sections: **Goal** ·
**Resume here** (next action · context needed · blocked by) · **Roadmap** (steps marked done /
current / next / backlog) · **Log** (append-only, dated) · **Open decisions** · **Links**
(`[[type:slug]]` wiki refs, `[[track:NNN-slug]]` siblings).

- **Resume here is load-bearing.** A cold agent with zero memory must know, from it alone, the
  single next action and the exact context it needs. Its first line becomes the registry's
  "next action" — write it to read well alone.
- **Status is frontmatter only.** The health check enforces the vocabulary and flags an `active`
  track left untouched too long (handoff it, or set `paused`/`done`).
- **Sub-documents** (a design, a test plan) carry frontmatter `parent: NNN-slug`; they are listed
  under the parent, never as rows. Any other `.md` in `.claude/tracks/` is flagged.
- **`index.md` is generated** — never edit it by hand; regenerate after every create, handoff
  and close.
- One concern per track; split if it sprawls. One worktree + one track per concurrent effort.
