# Agent Operating Protocol

<!-- init: installed by /context-loop:context init. Edit the marked spots for this repo; the
     rest is the context-loop protocol (spec: .claude/context/engine/specs/playbooks.md). -->

Shared rules for **every** agent working in this repo (the main session, the dev generalists and
the feature specialists). Read this once at the start of a task. It governs *how you emit output*
so that downstream agents and the episodic knowledge store
(`.claude/context/engine/scripts/knowledge-ingest.mjs` -> `/recall`) capture your reasoning
**deterministically** instead of inferring it.

It does **not** restate project rules: those live in `.claude/rules/`, the `CLAUDE.md` tree and
the wiki (`.claude/wiki/`). This file is about *output shape*.

---

## 1. Knowledge markers (`kb:` blocks)

When you reach a durable, reusable insight during work, **emit a fenced `kb:` block inline, in
your normal response**. The distiller extracts these verbatim (high fidelity), and any agent
reading your transcript or report sees them at a glance. Don't wait until the end; emit at the
moment of insight.

The five types match the knowledge-store record types exactly; use one as the fence info-string:

| Type | Emit when... |
|---|---|
| `decision` | You chose an approach over alternatives. Include the **why**. |
| `incident` | Something broke. Symptom -> root cause -> fix. |
| `gotcha` | A non-obvious surprise/trap a future agent would hit. |
| `dead-end` | An approach you tried and **rejected**, so nobody re-tries it. |
| `observation` | A durable truth about how the system actually behaves. |

### Format

<!-- init: replace the example with one from this repo's own domain and paths. -->
````
```kb:gotcha
entities: order, user
files: packages/core/src/orders/totals.ts, apps/web/app/checkout/Summary.tsx
Order totals are computed once in totals.ts#orderTotal and Summary only formats them.
Recomputing a total in the component silently diverges from the server-side amount when
a discount rule changes.
```
````

- First line after the fence: `entities:`, comma-separated domain nouns from the vocabulary in
  `.claude/context/project.json` (`entities`). Optional but encouraged.
- Optional `files:`, comma-separated repo-relative paths the insight concerns.
- Everything after the metadata lines is free text. **State the WHY**, in 1-4 sentences,
  self-contained (readable without the surrounding conversation).
- Don't emit for routine edits, restating code, or anything trivially re-derivable. Quality over
  quantity: two sharp `kb:` blocks beat ten obvious ones.

---

## 2. Subagent final report

When you are a subagent returning to an orchestrator, end with this exact section structure so the
handoff is parseable:

```
## Summary
One or two sentences: what you did and the outcome.

## Changes
- path/to/file.ts:line — what changed and why
(omit if you made no edits)

## Decisions & Gotchas
The kb: blocks you emitted (repeat them here, or "none").

## Verification
What you ran (tests, build, manual check) and the result. If you couldn't
verify, say so explicitly — never imply success you didn't observe.

## Handoff
What the orchestrator / next agent needs: open questions, follow-ups, risks,
or "complete — nothing pending".
```

The orchestrator relays your `## Summary` to the user (your full report is not visible to them).

---

## 3. Errors & blockers

When you hit a failure or get blocked, report it as an `incident` marker; never swallow it, never
paper over it:

````
```kb:incident
files: apps/web/app/orders/actions.ts:120
What failed: cancelOrder returned "order not found".
Where: the ownership check — it was passed the line-item id, not the order id.
Root cause: caller passed item.id; the action expects item.orderId.
Tried: reading orderId from the item — works.
Needed: nothing, fixed. (or: "blocked on X, need Y to proceed")
```
````

If a blocker stops you from completing the task, still produce the §2 report with the incident
under **Decisions & Gotchas** and the blocker under **Handoff**.

---

## 4. Reuse the existing canon, don't duplicate it

Before writing anything, consult in this order:

1. One cross-layer recall:
   `node .claude/context/engine/scripts/knowledge-recall.mjs "<topic>" --surface <agent>`
   (wiki, your playbook, tracks and past sessions in one tiered answer; skip if this repo has no
   episodic store).
2. The generated navigation index of your `.claude/knowledge/<agent>.md` (open entries by
   heading, never the whole file).
3. `.claude/rules/` + the `CLAUDE.md` tree (declarative rules).
4. `.claude/wiki/index.md`, for a cross-cutting flow the recall did not surface.
5. Source.

Credit the hits that helped (`--credit <id,id>`) in your retrospective, and after non-trivial work
add a v2 playbook entry (`.claude/context/engine/specs/playbooks.md`).

When you reference code, **cite `path/file.ts#symbol` or `path:line`**; do not paste code into
reports or markers.

<!-- init: name this repo's load-bearing conventions that agents most often re-explain (e.g. the
     server-action return shape, where status constants live, "prices come from the DB"), each
     with the rule file that states it. Keep it to one sentence: point, don't restate. -->
Project conventions are stated once, in `.claude/rules/`; follow them, don't re-explain them.
