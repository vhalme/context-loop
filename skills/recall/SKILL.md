---
name: recall
description: Cross-layer tiered recall over the knowledge store — wiki (canon), playbooks (curated), track resume-heres (intent), past sessions (episodic). Use before non-trivial work in an unfamiliar area, at task start, or when asking "have we hit this before?"; credit hits that helped.
argument-hint: "<query> [--surface <agent>] [--layer wiki|playbook|track|episodic|curated|all] [--k N] [--kc N] [--type T] [--source S] [--since DATE] [--json] | --credit <id,id> | --candidates <agent> [--limit N]"
allowed-tools: Bash(node:*)
---
# /context-loop:recall

Recall for: **$ARGUMENTS**

## 1. Preconditions

- No `.claude/context/budgets.json` → say the repo has no context-loop instance yet
  (set one up with `/context-loop:context init`) and stop.
- The store is **opt-in**: it is enabled only when `.claude/context/project.json` exists and does
  not set `"store": false`. Not enabled → say so and use the fallback in step 4.

## 2. Run it

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-recall.mjs" $ARGUMENTS
```

Modes: a query (`--surface <agent>` keeps only that agent's playbook in the playbook tier;
`--layer` restricts tiers, `curated` = wiki + playbook + track; `--k` bounds the episodic tier,
`--kc` each curated tier; `--json` for tooling) · `--credit <id,id>` · `--candidates <agent>`
(episodic → playbook promotion candidates, used by `/context-loop:groom`).

## 3. Read the tiers top-down

- **Wiki** (canon) — trust it and cite the page.
- **Playbook** (curated, verified) — apply it; open the full entry in
  `.claude/knowledge/<agent>.md` by heading if the excerpt is not enough.
- **Track** (intent) — where that effort stands; open the track for its Resume here.
- **Episodic** (raw past sessions) — leads only; verify each against the current code before
  relying on it.

When a hit helped, credit it: `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-recall.mjs" --credit
<id,id>`. Raw records become verified, and the credits feed `/context-loop:groom`.

## 4. Store unreachable or not enabled

A connection error (e.g. `ECONNREFUSED`) means the store's Postgres is not running. Do not retry
in a loop. If the store is enabled, tell the user it can be started with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-ensure.mjs"` (starts Docker and the container;
also runs at session start). Then fall back to the file layers, which are the source of the
curated tiers anyway: `.claude/wiki/index.md` → the relevant page; the playbook's navigation
index in `.claude/knowledge/<agent>.md`; `.claude/tracks/index.md`; Grep across `.claude/` for
the query terms. Episodic recall has no fallback — say it was unavailable.
