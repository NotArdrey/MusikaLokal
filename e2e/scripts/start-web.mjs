import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaultEnvPath = resolve(repoRoot, '.env.e2e');
const envPath = process.env.E2E_ENV_FILE
  ? resolve(repoRoot, process.env.E2E_ENV_FILE)
  : defaultEnvPath;

const parseDotEnv = (content) => {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
};

const fileEnv = existsSync(envPath)
  ? parseDotEnv(readFileSync(envPath, 'utf8'))
  : {};

const publicSupabaseUrl =
  fileEnv.E2E_SUPABASE_URL ||
  fileEnv.SUPABASE_URL ||
  fileEnv.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.E2E_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;
const publicSupabaseAnonKey =
  fileEnv.E2E_SUPABASE_ANON_KEY ||
  fileEnv.SUPABASE_ANON_KEY ||
  fileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.E2E_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
  console.error(
    `Missing web E2E Supabase public env. Checked ${envPath}. ` +
    'Provide .env.e2e or a root .env with EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
  process.exit(1);
}

const childEnv = {
  ...process.env,
  ...fileEnv,
  E2E_ENV_FILE: envPath,
  EXPO_PUBLIC_E2E: fileEnv.EXPO_PUBLIC_E2E || process.env.EXPO_PUBLIC_E2E || '1',
  EXPO_PUBLIC_SUPABASE_URL: publicSupabaseUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseAnonKey,
};

delete childEnv.E2E_SUPABASE_SERVICE_ROLE_KEY;
delete childEnv.E2E_SUPABASE_SECRET_KEY;
delete childEnv.SUPABASE_SERVICE_ROLE_KEY;
delete childEnv.SUPABASE_SECRET_KEY;

const resolveWebPort = () => {
  const rawBaseUrl = process.env.E2E_WEB_BASE_URL || fileEnv.E2E_WEB_BASE_URL || 'http://localhost:8082';
  try {
    return new URL(rawBaseUrl).port || '8082';
  } catch {
    return '8082';
  }
};

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(npxCommand, ['expo', 'start', '--web', '--port', resolveWebPort()], {
  cwd: resolve(repoRoot, 'web'),
  env: childEnv,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
