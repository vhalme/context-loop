---
name: groom
description: Groom one agent's playbook (.claude/knowledge/<agent>.md) — dedupe, verify stale entries against code, migrate to v2, regenerate the index, propose promotions in both directions. Use when the health line says a playbook is over budget, after a refactor that may have staled its entries, or on request.
argument-hint: "<agent>   (any playbook name under .claude/knowledge/)"
allowed-tools: Read, Edit, Write, Bash(node:*), Bash(git:*), Grep, Glob
---
# /context-loop:groom $ARGUMENTS

Curate `.claude/knowledge/$ARGUMENTS.md` per `${CLAUDE_SKILL_DIR}/workflow.md` (read it first —
it defines what to groom and what never to groom away). Grooming is the only operation that merges or
deletes playbook entries. **Produce and curate stay separate** — add no new task learnings here.

**Preconditions.** No `.claude/context/budgets.json` → say the repo has no context-loop instance
yet (`/context-loop:context init` is planned) and stop. No `$ARGUMENTS` or no
`.claude/knowledge/$ARGUMENTS.md` → list the playbooks in `.claude/knowledge/` and stop.

## Gate

Every cut must leave agents more *concise* or *deterministic* without becoming less *informed*,
*effective* or *reliable* (`${CLAUDE_PLUGIN_ROOT}/specs/playbooks.md`). A lesson still reachable
against current code stays (revise it if the code moved). A **dead-end** stays unless re-trying
it could no longer waste time. Anything that should be canon is **promoted**, not deleted.

## Procedure

1. **Read the signals.**
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/context-health.mjs" --scope playbooks` — budget,
     duplicate sections, dated `##` headings, missing `tags:`, broken citations.
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-recall.mjs" --candidates $ARGUMENTS` —
     **inbound** promotion candidates. Skip (say so) if the store is not enabled in
     `.claude/context/project.json` or is unreachable.
   - Read the whole playbook once (this is the one place that is allowed).
2. **Classify every entry** — keep · merge-into · revise · delete · promote-to-canon. For each
   delete/revise candidate, **open the cited code** (`path/file.ts#symbol`) and confirm whether
   the Problem can still happen. Low confidence or high cost of being wrong → keep it and list
   it for the human.
3. **Apply the structural fixes** (mechanical, always):
   - every entry is `### YYYY-MM-DD: title` under a `##` theme section — convert dated `##`
     entries, merge duplicate section headings, remove empty mid-file sections;
   - add the v2 `tags:` line to every entry (`entities=… · files=… · track=…`, same vocabulary
     as `kb:` markers; files repo-relative), keeping the earliest date on merged entries;
   - fix or drop citations the health check reports as missing.
4. **Apply the content decisions** from step 2. Merge overlapping entries into the clearer one;
   rewrite stale ones; delete superseded ones. Long entries (> ~2 KB) that narrate a work
   session: keep the Problem/Solution/Prevention core, drop the narration.
5. **Write inbound promotions.** For each `--candidates` cluster that passes the gate, add a v2
   entry (dated with the latest session) under the right section, citing code. Then
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-recall.mjs" --credit <ids of the cluster>`.
6. **Regenerate the index:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/playbook-index.mjs" $ARGUMENTS`;
   then `context-health.mjs --scope playbooks` must be clean for this file (or under the soft
   budget with only INFO left).
7. **Outbound promotions — propose, never apply.** List each entry that is authoritative *and*
   cross-cutting as an exact command for the orchestrator: `/context-loop:wiki ingest <page>` or
   `/context-loop:update-knowledge <file>`, with a one-line summary of what moves. A human decides.
8. **Do not** run `knowledge-curated.mjs` or `context-health.mjs --snapshot` from inside a
   groom — the orchestrator runs them once after all grooms, to avoid concurrent writes.

## Report (end with exactly this)

```
## Groom: <agent>
Before → after: <bytes> → <bytes>, <entries> → <entries>
Merged: … · Revised: … · Deleted (verified against code): … · Kept with doubt (for the human): …
Inbound promotions written: <n> (credited ids …)
Outbound promotion proposals:
- /context-loop:wiki ingest <page> — <what>
- /context-loop:update-knowledge <file> — <what>
Health: <context-health --scope playbooks line for this file>
```
