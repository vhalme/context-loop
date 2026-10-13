// Instance configuration for the context-system scripts (track 033).
//
// The scripts are the ENGINE — the same in every repo. Everything that names this repo lives in
// two instance files under .claude/context/: budgets.json (size/freshness thresholds, agent
// surfaces, version claims) and project.json (identity, the episodic store, the entity
// vocabulary). This module is the only place that resolves them, so the scripts can run from a
// plugin directory against any repo. Dependency-free on purpose: the SessionStart hooks import it.

import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'fs';
import { execSync } from 'child_process';
import { join, basename, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

// The engine (this plugin) is installed under a versioned cache path. Each session start points
// the repo-local link .claude/context/engine at it (engine-link.mjs), so agents, git hooks and docs
// inside the repo can use one stable path: node .claude/context/engine/scripts/<script>.
export const ENGINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ENGINE_LINK = join('.claude', 'context', 'engine');

// How to run an engine script, for fix hints and usage text: through the repo's engine link when
// it points here, else by absolute path.
export function scriptCmd(name, root = repoRoot()) {
  const link = join(root, ENGINE_LINK);
  try {
    if (realpathSync(link) === realpathSync(ENGINE_ROOT)) return `node ${join(ENGINE_LINK, 'scripts', name)}`;
  } catch { /* no link */ }
  const abs = join(ENGINE_ROOT, 'scripts', name);
  const rel = relative(root, abs);
  return `node ${rel.startsWith('..') ? `"${abs}"` : rel}`;
}

// True when the calling module is the script being run. Compares real paths: scripts are usually
// invoked through the .claude/context/engine symlink, while import.meta.url is already resolved.
export function isMain(metaUrl) {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl)); }
  catch { return false; }
}

// The repo the scripts act on — never the scripts' own location. git, run in the hook-provided
// project dir when there is one (else cwd), so worktrees resolve to themselves.
export function repoRoot() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try { return execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return cwd; }
}

// A repo has a context-system instance when it has .claude/context/budgets.json. The plugin's
// hooks fire in every repo; they act only where an instance exists.
export const hasInstance = (root) => existsSync(join(contextDir(root), 'budgets.json'));

// The episodic store is opt-in per repo: project.json must exist and not say "store": false.
// Without the opt-in no hook starts Docker or writes to a database.
export function storeEnabled(root) {
  const raw = readJson(join(contextDir(root), 'project.json'));
  return !!raw && raw.store !== false && raw.store?.enabled !== false;
}

export const contextDir = (root) => join(root, '.claude', 'context');

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

// budgets.json is required by the health check; other callers treat a missing file as "no
// budgets" and fall back to their own defaults.
export function loadBudgets(root, { required = false } = {}) {
  const p = join(contextDir(root), 'budgets.json');
  const b = readJson(p);
  if (!b && required) {
    console.error(`context: no ${p} — this repo has no context-system instance (run /context init)`);
    process.exit(2);
  }
  return b || {};
}

// project.json with engine defaults filled in. The store defaults derive from the project slug,
// so a fresh repo gets its own container/database without any configuration.
export function loadProject(root) {
  const raw = readJson(join(contextDir(root), 'project.json')) || {};
  const project = String(raw.project || basename(root)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const s = raw.store || {};
  const store = {
    container: s.container || `${project}-knowledge-postgres`,
    volume: s.volume || `${project}-knowledge-data`,
    image: s.image || 'pgvector/pgvector:pg17',
    port: s.port || 5434,
    user: s.user || 'postgres',
    password: s.password || 'knowledge',
    database: s.database || `${project.replace(/-/g, '_')}_knowledge`,
  };
  return { project, store, entities: Array.isArray(raw.entities) ? raw.entities : [] };
}

// KNOWLEDGE_DB_URL (env or .claude/.env.knowledge, loaded by the caller) overrides the derived URL.
export function storeUrl(store) {
  return process.env.KNOWLEDGE_DB_URL
    || `postgres://${store.user}:${store.password}@localhost:${store.port}/${store.database}`;
}

// Workspace patterns from package.json "workspaces" (npm/yarn) or pnpm-workspace.yaml.
// Only literal dirs and trailing `/*` globs are expanded — the shapes monorepos actually use.
export function workspacePatterns(root) {
  const pkg = readJson(join(root, 'package.json')) || {};
  let pats = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages || [];
  const pnpm = join(root, 'pnpm-workspace.yaml');
  if (!pats.length && existsSync(pnpm)) {
    pats = [...readFileSync(pnpm, 'utf8').matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/gm)].map((m) => m[1]);
  }
  return pats.filter((p) => !p.startsWith('!'));
}

export function workspaceDirs(root) {
  const out = [];
  for (const pat of workspacePatterns(root)) {
    if (pat.endsWith('/*')) {
      const base = pat.slice(0, -2);
      const dir = join(root, base);
      if (!existsSync(dir)) continue;
      for (const sub of readdirSync(dir)) {
        const p = join(dir, sub);
        if (statSync(p).isDirectory() && existsSync(join(p, 'package.json'))) out.push(`${base}/${sub}`);
      }
    } else if (!pat.includes('*') && existsSync(join(root, pat, 'package.json'))) {
      out.push(pat.replace(/\/$/, ''));
    }
  }
  return out;
}

// First path segment of every workspace pattern (e.g. apps, packages) — used to normalise
// absolute paths from other worktrees to repo-relative ones.
export function pathAnchors(root) {
  const a = new Set(workspacePatterns(root).map((p) => p.split('/')[0]).filter((s) => s && !s.includes('*')));
  return a.size ? [...a] : ['src'];
}
