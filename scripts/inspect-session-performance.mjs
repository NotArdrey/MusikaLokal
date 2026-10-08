// Run the current offline performance checks; preserve the original inspection evidence.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = spawnSync(process.execPath, ['--test', 'scripts/test-session-performance.mjs'], {
  cwd: root, stdio: 'inherit',
});
if (run.error) throw run.error;
const evidencePath = resolve(root, 'docs/testing/session-performance-fixes-2026-10-07.json');
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
evidence.performanceChecksPassed = run.status === 0;
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
process.exitCode = run.status ?? 1;
