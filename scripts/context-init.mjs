#!/usr/bin/env node
// Create a context-loop instance in the current repo — the mechanical half of
// /context-loop:context init. Deterministic and idempotent: it only creates files that are
// missing, appends the root CLAUDE.md section once (between markers), and merges agent surfaces
// into budgets.json. Drafting CLAUDE.md content is the skill's (LLM) half, not this script's.
//
//   context-init.mjs --plan [--json]       # what would be written; changes nothing
//   context-init.mjs [--store] [--project <slug>] [--agent <name>=<path>[,<path>]]...
//
//   --store     enable the episodic recall store (Docker + pgvector) and provision it now
//   --project   slug for project.json (default: package.json name, else the directory name)
//   --agent     add a surface dev agent: .claude/agents/<name>.md + playbook + budgets surface

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { spawnSync } from 'child_process';
import {
  repoRoot, workspaceDirs, workspacePatterns, ENGINE_ROOT,
} from './context-config.mjs';
import { render as renderTracksIndex } from './tracks-index.mjs';
import { applyNav } from './playbook-index.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i !== -1 ? args[i + 1] : undefined; };
const agentSpecs = args.flatMap((a, i) => (a === '--agent' && args[i + 1] ? [args[i + 1]] : []));
const PLAN = flag('plan');
const JSON_OUT = flag('json');

const ROOT = repoRoot();
const T = (f) => readFileSync(join(ENGINE_ROOT, 'templates', f), 'utf8');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const actions = []; // { path, action: create|append|update|skip, note?, content? }

function plan(path, content, note) {
  const full = join(ROOT, path);
  actions.push(existsSync(full) ? { path, action: 'skip', note: 'exists' } : { path, action: 'create', note, content });
}

// ---- repo facts ----
const rootPkg = existsSync(join(ROOT, 'package.json')) ? readJson(join(ROOT, 'package.json')) : null;
const workspaces = workspaceDirs(ROOT);
const patterns = workspacePatterns(ROOT);
const pm = existsSync(join(ROOT, 'pnpm-lock.yaml')) ? 'pnpm'
  : existsSync(join(ROOT, 'bun.lock')) || existsSync(join(ROOT, 'bun.lockb')) ? 'bun'
  : existsSync(join(ROOT, 'yarn.lock')) ? 'yarn' : 'npm';
const slug = (opt('project') || (rootPkg?.name || basename(ROOT)).replace(/^@[^/]+\//, ''))
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const APP_ROOTS = /^(apps?|services?|sites?|web|frontends?|backends?)$/;
const CONFIG_WS = /(^|[-/])(eslint|prettier|tsconfig|typescript|jest|vitest|babel|tailwind)-?config$|(^|\/)(config|tooling)$/;

// ---- budgets.json ----
const budgetsPath = '.claude/context/budgets.json';
let budgets;
if (existsSync(join(ROOT, budgetsPath))) {
  budgets = readJson(join(ROOT, budgetsPath));
  actions.push({ path: budgetsPath, action: 'skip', note: 'instance exists' });
} else {
  budgets = JSON.parse(T('budgets.json'));
  const tmpl = budgets.canonical.files;
  const files = { 'CLAUDE.md': tmpl['CLAUDE.md'] };
  for (const p of patterns) {
    const top = p.split('/')[0];
    const b = APP_ROOTS.test(top) ? tmpl['apps/*/CLAUDE.md'] : tmpl['packages/*/CLAUDE.md'];
    files[p.endsWith('/*') ? `${p}/CLAUDE.md` : `${p.replace(/\/$/, '')}/CLAUDE.md`] = b;
  }
  files['.claude/rules/*.md'] = tmpl['.claude/rules/*.md'];
  budgets.canonical.files = files;
  budgets.canonical._files = 'Budget per auto-loaded canonical file. An exact path wins; otherwise the first matching glob in key order (* matches one path segment). Written by init from this repo\'s workspace patterns; add an exact-path entry to give one workspace a different budget.';
  budgets.canonical.optionalWorkspaces = workspaces.filter((w) => CONFIG_WS.test(w));
  actions.push({ path: budgetsPath, action: 'create', note: `${patterns.length} workspace pattern(s), ${workspaces.length} workspace(s)`, content: null });
}

// ---- agents (surfaces) ----
const agents = agentSpecs.map((s) => {
  const [name, paths] = s.split('=');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name || '') || !paths) { console.error(`bad --agent '${s}' (want name=path[,path])`); process.exit(2); }
  return { name, prefixes: paths.split(',').map((p) => p.replace(/^\.\//, '').replace(/\/?$/, '/')) };
});
budgets.agents.surfaces = budgets.agents.surfaces || {};
for (const a of agents) {
  if (budgets.agents.surfaces[a.name]) continue;
  budgets.agents.surfaces[a.name] = a.prefixes;
  if (actions.find((x) => x.path === budgetsPath).action === 'skip') {
    actions.push({ path: budgetsPath, action: 'update', note: `add surface ${a.name}` });
  }
}

// ---- project.json ----
{
  const p = JSON.parse(T('project.json'));
  p.project = slug;
  p.store = flag('store') ? {} : false;
  plan('.claude/context/project.json', JSON.stringify(p, null, 2) + '\n', `project "${slug}", recall store ${flag('store') ? 'on' : 'off'}`);
}
plan('.claude/context/.gitignore', 'engine\n', 'keeps the machine-local engine link out of git');

// ---- layer scaffolds ----
const pointer = (title, spec, skill, extra = '') => `# ${title}\n\nGoverned by the context-loop spec \`.claude/context/engine/specs/${spec}\`; operate it with \`${skill}\`.\nThis file holds only this repo's local conventions.${extra}\n\n## Local conventions\n\n- _None yet._\n`;
plan('.claude/wiki/README.md', pointer('Wiki', 'wiki.md', '/context-loop:wiki', ' Start any "how does X work end-to-end" question at `index.md`.'));
plan('.claude/wiki/index.md', `# Wiki index\n\nOne line per page: \`[type:slug](path) — **status** — summary\`. Maintained by \`/context-loop:wiki ingest\`.\n\n## Entities — core domain concepts\n\n## Flows — end-to-end journeys\n\n## Subsystems — infrastructure and cross-cutting machinery\n\n## Workflows — this repo's procedures\n`);
plan('.claude/wiki/log.md', `# Wiki log\n\nAppend-only; newest at the bottom. Format: \`.claude/context/engine/specs/wiki.md\` § Log format.\n\n## [${today}] init | wiki created by /context-loop:context init\n- changed: README.md, index.md, log.md\n- reason: new context-loop instance\n- by: auto\n`);
for (const d of ['entities', 'flows', 'subsystems']) plan(`.claude/wiki/${d}/.gitkeep`, '');
plan('.claude/knowledge/README.md', pointer('Agent playbooks', 'playbooks.md', '/context-loop:groom <agent>'));
plan('.claude/tracks/README.md', pointer('Tracks', 'tracks.md', '/context-loop:track', ' Start at `index.md` (generated).'));
plan('.claude/tracks/index.md', null, 'generated by tracks-index');

// ---- agents: definition + playbook + protocol ----
function verifyFor(prefix) {
  const pj = join(ROOT, prefix, 'package.json');
  const scripts = existsSync(pj) ? Object.keys(readJson(pj).scripts || {}) : [];
  const run = pm === 'npm' ? 'npm run' : pm;
  const steps = ['typecheck', 'lint', 'test'].filter((s) => scripts.includes(s)).map((s) => `${run} ${s}`);
  return steps.length ? `\`cd ${prefix.replace(/\/$/, '')} && ${steps.join(' && ')}\`.` : '_No typecheck/lint/test scripts found — name the commands that prove a change works._';
}
if (agents.length) plan('.claude/agent-protocol.md', T('agent-protocol.md'), 'shared protocol for dev agents');
for (const a of agents) {
  const list = a.prefixes.map((p) => `\`${p.replace(/\/$/, '')}\``).join(', ');
  const canon = a.prefixes.map((p) => `\`${p}CLAUDE.md\``).join(', ');
  const body = T('agent.md')
    .replaceAll('{{name}}', a.name).replaceAll('{{surfaceList}}', list).replaceAll('{{canonList}}', canon)
    .replaceAll('{{maxTurns}}', String(budgets.agents.maxTurns || 80)).replaceAll('{{verify}}', verifyFor(a.prefixes[0]));
  plan(`.claude/agents/${a.name}.md`, body, `surface ${list}`);
  const pb = `# ${a.name} playbook\n\nThe growing, curated memory of the \`${a.name}\` agent, governed by \`.claude/context/engine/specs/playbooks.md\`.\n\n## Gotchas\n\n## Test failures & fixes\n\n## Rejected approaches\n`;
  plan(`.claude/knowledge/${a.name}.md`, applyNav(pb), 'empty playbook with generated nav block');
}

// ---- root CLAUDE.md section ----
const BEGIN = '<!-- context-loop:begin -->';
const END = '<!-- context-loop:end -->';
const section = [
  BEGIN,
  '## Context system — how knowledge reaches a session',
  '',
  '**What loads when.** This file, `.claude/rules/*.md` and the memory index load in every session. A',
  "directory's `CLAUDE.md` loads when a file under it is read. Everything else — sibling docs, the",
  'wiki, playbooks, tracks — is pulled on demand. Keep auto-loaded files inside their budgets',
  '(`.claude/context/budgets.json`); move narrative to a pulled sibling or the wiki.',
  '',
  '**Layers** (trust rises down the list, authority rises up it):',
  '- **Canon** — the `CLAUDE.md` tree + `.claude/rules/`. Maintained by `/context-loop:update-knowledge`.',
  '- **Wiki** `.claude/wiki/` — concept-level synthesis; start at `index.md` for any "how does X',
  '  work end-to-end" question. After shipping something non-trivial: `/context-loop:wiki ingest`.',
  '- **Tracks** `.claude/tracks/` — multi-session work; check `index.md` before non-trivial work,',
  '  `/context-loop:track handoff` before stopping.',
  '- **Playbooks** `.claude/knowledge/<agent>.md` — each dev agent\'s curated lessons;',
  '  `/context-loop:groom <agent>` curates them.',
  ...(flag('store') ? [
    '- **Recall** — a local pgvector store of all of the above plus distilled past sessions:',
    '  `/context-loop:recall <query>`; credit hits that helped with `--credit <ids>`.',
  ] : []),
  '',
  '**Engine.** The `context-loop` plugin. Each session links `.claude/context/engine` to it, so',
  'scripts run as `node .claude/context/engine/scripts/<script>.mjs`; specs are in',
  '`.claude/context/engine/specs/`.',
  '',
  '**Health.** A one-line summary prints at session start; `/context-loop:context check` is the',
  'full report with a fix command per finding. Nothing blocks.',
  END,
].join('\n');
{
  const p = join(ROOT, 'CLAUDE.md');
  if (!existsSync(p)) actions.push({ path: 'CLAUDE.md', action: 'create', note: 'new; the skill drafts the project overview above the section', content: `# CLAUDE.md\n\n${section}\n` });
  else if (readFileSync(p, 'utf8').includes(BEGIN)) actions.push({ path: 'CLAUDE.md', action: 'skip', note: 'section present' });
  else actions.push({ path: 'CLAUDE.md', action: 'append', note: 'context-system section', content: section });
}

// ---- report or apply ----
const facts = { root: ROOT, project: slug, packageManager: pm, workspacePatterns: patterns, workspaces,
  workspacesWithoutClaudeMd: workspaces.filter((w) => !existsSync(join(ROOT, w, 'CLAUDE.md')) && !budgets.canonical.optionalWorkspaces.includes(w)),
  store: flag('store'), agents: agents.map((a) => a.name) };

if (PLAN) {
  if (JSON_OUT) { console.log(JSON.stringify({ facts, actions: actions.map(({ content, ...a }) => a) }, null, 2)); process.exit(0); }
  console.log(`context-loop init — plan for ${ROOT}`);
  console.log(`project "${slug}" · ${pm} · ${workspaces.length} workspace(s)${patterns.length ? ` from ${patterns.join(', ')}` : ' (single package)'} · recall store ${flag('store') ? 'on' : 'off'}`);
  for (const a of actions) console.log(`  ${a.action.padEnd(6)} ${a.path}${a.note ? `  — ${a.note}` : ''}`);
  if (facts.workspacesWithoutClaudeMd.length) console.log(`workspaces without a CLAUDE.md (the skill drafts these): ${facts.workspacesWithoutClaudeMd.join(', ')}`);
  process.exit(0);
}

const write = (rel, content) => { const f = join(ROOT, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, content); };
for (const a of actions) {
  if (a.action === 'create' && a.path === budgetsPath) write(a.path, JSON.stringify(budgets, null, 2) + '\n');
  else if (a.action === 'update' && a.path === budgetsPath) write(a.path, JSON.stringify(budgets, null, 2) + '\n');
  else if (a.action === 'create' && a.path === '.claude/tracks/index.md') write(a.path, renderTracksIndex(ROOT, { nextActionMaxChars: budgets.tracks?.nextActionMaxChars }));
  else if (a.action === 'create') write(a.path, a.content);
  else if (a.action === 'append') {
    const cur = readFileSync(join(ROOT, a.path), 'utf8');
    write(a.path, `${cur.trimEnd()}\n\n${a.content}\n`);
  }
}

// engine link (the SessionStart hook does this too; doing it now makes the instance usable at once)
spawnSync(process.execPath, [join(ENGINE_ROOT, 'scripts', 'engine-link.mjs')], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });

let storeNote = '';
if (flag('store')) {
  const r = spawnSync(process.execPath, [join(ENGINE_ROOT, 'scripts', 'store-provision.mjs')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });
  storeNote = (r.stdout || '') + (r.stderr || '');
}

const done = actions.filter((a) => a.action !== 'skip');
if (JSON_OUT) console.log(JSON.stringify({ facts, written: done.map((a) => `${a.action} ${a.path}`), store: storeNote.trim() }, null, 2));
else {
  console.log(`context-loop init — ${done.length} change(s) in ${ROOT}`);
  for (const a of done) console.log(`  ${a.action.padEnd(6)} ${a.path}`);
  if (storeNote) console.log(storeNote.trim());
  console.log('Optional: show the health line on every push by adding to your pre-push hook:');
  console.log('  node .claude/context/engine/scripts/context-health.mjs --summary || true');
}
