# context-loop

Layered, self-curating AI context for [Claude Code](https://claude.com/claude-code).

Most repos give Claude one `CLAUDE.md` that grows until nobody trusts it. context-loop splits
project knowledge into layers with clear owners, and closes the loop that usually stays open:
everything that writes context has a matching step that curates, prunes and verifies it.

| Layer | Lives in your repo | Kept current by |
|---|---|---|
| Canon | `CLAUDE.md` tree, `.claude/rules/` | `/context-loop:update-knowledge`, within byte budgets |
| Wiki | `.claude/wiki/` (entities, flows, subsystems) | `/context-loop:wiki ingest · lint · prune · review` |
| Playbooks | `.claude/knowledge/<agent>.md` | each agent's retrospective + `/context-loop:groom` |
| Tracks | `.claude/tracks/` (multi-session work) | `/context-loop:track create · handoff · close` |
| Recall (optional) | local pgvector store | distilled from every session; `/context-loop:recall` |

A health check (`context-health.mjs`, under a second, no network) prints one line at every
session start: what is over budget, stale or broken, and the command that fixes it. It never
blocks anything.

## Status

Early (0.1). The engine is in daily use on one large monorepo. `/context-loop:context init`,
which sets up a new repo, is not written yet. Until it is, a repo needs
`.claude/context/budgets.json` (copy `templates/budgets.json`) before the plugin does anything.

## Install

```
/plugin marketplace add vhalme/context-loop
/plugin install context-loop@context-loop
```

The hooks act only in repos that have `.claude/context/budgets.json`. The recall store is
opt-in through `.claude/context/project.json`; without it, no Docker container is started.

## Layout

- `skills/` — the six skills above, with their procedures
- `scripts/` — the engine (health check, registries, knowledge store)
- `specs/` — the layer specs: `wiki.md`, `playbooks.md`, `tracks.md`, `context-system.md`
- `templates/` — instance files that `init` will write
- `hooks/hooks.json` — session-start health line, store start-up, session-end ingest

Inside a repo, the plugin is reachable at `.claude/context/engine` (a git-ignored link that each
session refreshes), so agents and git hooks can run `node .claude/context/engine/scripts/…`.

## License

MIT
