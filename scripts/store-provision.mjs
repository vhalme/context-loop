#!/usr/bin/env node
// Provision the episodic recall store for this repo: the pgvector container, its database and
// the schema, all named by .claude/context/project.json `store` (context-config.mjs). Idempotent:
// an existing container is started, an existing database kept, and the schema uses IF NOT EXISTS
// throughout. Needs Docker running; reports and exits 1 when it is not.

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { join } from 'path';
import { repoRoot, loadProject, storeEnabled, contextDir, ENGINE_ROOT } from './context-config.mjs';

const root = repoRoot();
if (!storeEnabled(root)) { console.log('store: disabled in .claude/context/project.json — nothing to provision'); process.exit(0); }
let s = loadProject(root).store;
const docker = (...a) => spawnSync('docker', a, { encoding: 'utf8' });

if (docker('info').status !== 0) { console.error('store: Docker is not running — start it, then re-run store-provision.mjs'); process.exit(1); }

if (docker('inspect', s.container).status === 0) {
  docker('start', s.container);
  console.log(`store: container ${s.container} exists (started)`);
} else {
  // Every repo's store defaults to :5434, so a second repo would collide with the first. Take the
  // first free port from the configured one upward and pin it in project.json.
  // Docker Desktop publishes ports in its own VM, so a local listen test can miss them: check the
  // ports Docker reports as published, then the host.
  const published = new Set([...docker('ps', '-a', '--format', '{{.Ports}}').stdout.matchAll(/:(\d+)->/g)].map((m) => +m[1]));
  const hostFree = (port) => new Promise((res) => { const srv = createServer().once('error', () => res(false)).once('listening', () => srv.close(() => res(true))).listen(port, '0.0.0.0'); });
  const free = async (port) => !published.has(port) && (await hostFree(port));
  let port = s.port;
  while (!(await free(port)) && port < s.port + 100) port++;
  if (port !== s.port) {
    const pj = join(contextDir(root), 'project.json');
    const raw = JSON.parse(readFileSync(pj, 'utf8'));
    raw.store = { ...(raw.store || {}), port };
    writeFileSync(pj, JSON.stringify(raw, null, 2) + '\n');
    console.log(`store: port ${s.port} is taken — using ${port} (pinned in project.json)`);
    s = { ...s, port };
  }
  const r = docker('run', '-d', '--name', s.container, '--restart', 'unless-stopped',
    '-e', `POSTGRES_PASSWORD=${s.password}`, '-p', `${s.port}:5432`,
    '-v', `${s.volume}:/var/lib/postgresql/data`, s.image);
  if (r.status !== 0) {
    docker('rm', '-f', s.container); // a failed run can leave a created-but-unstartable container
    console.error(`store: docker run failed — ${(r.stderr || '').trim().split('\n').pop()}`);
    process.exit(1);
  }
  console.log(`store: created ${s.container} on :${s.port} (volume ${s.volume})`);
}

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  ready = docker('exec', s.container, 'pg_isready', '-U', s.user).status === 0;
  if (!ready) spawnSync('sleep', ['1']);
}
if (!ready) { console.error('store: Postgres did not become ready within 60 s'); process.exit(1); }

const exists = docker('exec', s.container, 'psql', '-U', s.user, '-tAc', `SELECT 1 FROM pg_database WHERE datname='${s.database}'`).stdout.trim() === '1';
if (!exists) docker('exec', s.container, 'psql', '-U', s.user, '-c', `CREATE DATABASE "${s.database}";`);
const schema = readFileSync(join(ENGINE_ROOT, 'scripts', 'knowledge-schema.sql'), 'utf8');
const r = spawnSync('docker', ['exec', '-i', s.container, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', s.user, '-d', s.database], { input: schema, encoding: 'utf8' });
if (r.status !== 0) { console.error(`store: schema failed — ${(r.stderr || '').trim().split('\n').pop()}`); process.exit(1); }
console.log(`store: database ${s.database} ${exists ? 'present' : 'created'}, schema applied`);
