# Workflow: init — create a context-loop instance in this repo

Two halves. The **mechanical** half is `context-init.mjs`: deterministic, idempotent, it only
creates missing files (instance config, layer scaffolds, agents, the root `CLAUDE.md` section).
The **judgment** half is yours: the decisions the user owns, and drafting canon from the code.
`<ENGINE>` below is the plugin root that SKILL.md printed; the repo's `.claude/context/engine`
link does not exist until the script has run.

**Non-negotiables.** Never overwrite or rewrite existing content: an existing `CLAUDE.md`,
`AGENTS.md`, rules or docs are the user's — init only appends its marked section. Never commit.
Everything drafted is a proposal the user reviews.

## Procedure

### 1. Plan (read-only)

Run `node "<ENGINE>/scripts/context-init.mjs" --plan --json` and read `facts` and `actions`.
If `budgets.json` is reported as existing, the repo already has an instance: say so, offer the
two things init can still add (agents via step 2, missing workspace `CLAUDE.md` drafts via
step 4), and stop unless the user wants one of them.

Also note what context the repo already has: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
`.github/copilot-instructions.md`, `docs/`, a README. You will point at it, not move it.

### 2. Ask the user — two decisions, one question each

If the arguments already decide them (`init --store` or `--no-store`, `--agent name=path ...` or
`--no-agents`), use those and do not ask. Otherwise use AskUserQuestion:

1. **Recall store.** On = a local Docker container (pgvector) that distils every session into
   searchable memory and powers `/context-loop:recall`; needs Docker and roughly 400 MB of
   dependencies the plugin already installed. Off = every other layer still works. Recommend
   on only if Docker is installed (`docker info` succeeds).
2. **Dev agents** (multi-select). Propose one surface agent per workspace that holds real code
   (skip config packages and the optional ones), named `<workspace-basename>-dev`, e.g.
   `web-dev=apps/web`. For a single-package repo offer one agent for the whole repo
   (`<project>-dev=src`) or none. Agents are optional; a small repo is fine without them.

### 3. Apply

`node "<ENGINE>/scripts/context-init.mjs" [--store] [--agent name=path ...]` (`--no-store` and
`--no-agents` are simply the absence of those flags) — report its
output. With `--store` it provisions the container (a taken port is replaced by a free one and
pinned in `project.json`); if Docker fails, report it and continue — the user can re-run
`node .claude/context/engine/scripts/store-provision.mjs` later.

### 4. Draft canon from the code

Read before you write: root `package.json` (scripts), the README, the directory layout, each
workspace's `package.json` and entry points. Facts only — every line must be checkable against
the code; no speculation, no aspirations. Stay under the soft budgets in
`.claude/context/budgets.json` (`canonical.files`); prefer compact tables to prose.

- **Root `CLAUDE.md`.** If init created it, write the project overview *above* the
  context-loop section: what the repo is (2–3 lines), a workspace map table
  (`path — what — how to run`), the commands that matter (dev, build, test, lint), and the
  load-bearing conventions you can see in the code. If it already existed, leave the user's
  content alone; at most list gaps you noticed in your report.
- **Workspace `CLAUDE.md`** for each entry in `facts.workspacesWithoutClaudeMd`: purpose,
  a "where things are" table, invariants visible in the code, and a **Verify** line with the
  workspace's real typecheck/lint/test commands. A workspace with nothing to say gets a 3-line
  pointer, or goes under `budgets.json` `canonical.optionalWorkspaces` — ask if unsure.
- **Agents** (if created): sharpen each `.claude/agents/<name>.md` description with the
  surface's main features, and replace the two `<!-- init: ... -->` spots in
  `.claude/agent-protocol.md` with an example and conventions from this repo.
- **Entities**: set `.claude/context/project.json` `entities` to the 4–8 domain nouns the code
  is organised around (models, tables, core types). They tag recall records and playbook entries.

Do not create wiki pages, tracks or rules during init. The wiki grows by `/context-loop:wiki
ingest` as real work lands; an empty layer is correct for a new instance.

### 5. Verify and report

Run `node .claude/context/engine/scripts/context-health.mjs`. It should show no BROKEN findings;
remaining WARNs must each be explained in your report (e.g. an agent cites a workspace
`CLAUDE.md` you chose not to draft).

Report:

```
## context-loop init: <project>
Instance: <files created> · recall store <on (container, port) | off> · agents <names | none>
Drafted for review: <CLAUDE.md files, agent descriptions, protocol spots, entities>
Existing context left in place: <CLAUDE.md / AGENTS.md / docs …>
Health: <summary line>
Next: review the drafts, commit .claude/ and the CLAUDE.md files. Optional pre-push line:
  node .claude/context/engine/scripts/context-health.mjs --summary || true
```
