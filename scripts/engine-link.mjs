#!/usr/bin/env node
// SessionStart hook — point the repo's .claude/context/engine at this plugin install.
//
// The plugin lives under a versioned cache path that changes on every update, but agents, git
// hooks and docs inside the repo need one stable way to reach the scripts and specs. This link
// is that path: `node .claude/context/engine/scripts/<script>.mjs`, `.claude/context/engine/specs/`.
// It is machine-local, so it is kept out of git by .claude/context/.gitignore, which this
// script creates. Acts only in a repo with a context-loop instance; silent; always exits 0.

import { existsSync, lstatSync, readlinkSync, symlinkSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { repoRoot, hasInstance, contextDir, ENGINE_ROOT, ENGINE_LINK } from './context-config.mjs';

try {
  const root = repoRoot();
  if (!hasInstance(root)) process.exit(0);
  const link = join(root, ENGINE_LINK);
  const target = resolve(ENGINE_ROOT);
  let st = null;
  try { st = lstatSync(link); } catch { /* absent */ }
  if (st && !st.isSymbolicLink()) process.exit(0); // a vendored engine copy: leave it alone
  const current = st ? resolve(join(link, '..'), readlinkSync(link)) : null;
  if (current !== target) {
    try {
      if (st) unlinkSync(link);
      symlinkSync(target, link, 'dir');
    } catch { /* raced or unsupported: the next session retries */ }
  }
  const gi = join(contextDir(root), '.gitignore');
  const lines = existsSync(gi) ? readFileSync(gi, 'utf8').split('\n') : [];
  if (!lines.includes('engine')) writeFileSync(gi, [...lines.filter(Boolean), 'engine', ''].join('\n'));
} catch { /* never block a session */ }
process.exit(0);
