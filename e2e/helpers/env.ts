import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CURRENT_NON_E2E_PROJECT_REF = 'aefldxegsvzecshlayza';
export const DANGEROUS_PROTECTED_PROJECT_BYPASS_KEY = 'E2E_DANGEROUS_ALLOW_PROTECTED_PROJECT';
export const DANGEROUS_PROTECTED_PROJECT_BYPASS_VALUE =
  `I_UNDERSTAND_E2E_CAN_MODIFY_DATA_IN_${CURRENT_NON_E2E_PROJECT_REF}`;

export type E2EEnv = {
  E2E_SUPABASE_URL: string;
  E2E_SUPABASE_ANON_KEY: string;
  E2E_SUPABASE_SERVICE_ROLE_KEY: string;
  E2E_ADMIN_EMAIL: string;
  E2E_ADMIN_PASSWORD: string;
  E2E_MOBILE_APP_ID: string;
  E2E_WEB_BASE_URL: string;
  EXPO_PUBLIC_E2E: string;
  E2E_RUN_ID: string;
  E2E_DANGEROUS_ALLOW_PROTECTED_PROJECT?: string;
};

const requiredKeys = [
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_ANON_KEY',
  'E2E_SUPABASE_SERVICE_ROLE_KEY',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_MOBILE_APP_ID',
  'E2E_WEB_BASE_URL',
] as const;

const repoRoot = resolve(__dirname, '..', '..');
const envPath = resolve(repoRoot, '.env.e2e');
const rootEnvPath = resolve(repoRoot, '.env');

let cachedEnv: E2EEnv | null = null;

const adminDataKeyAliases = [
  'E2E_SUPABASE_SERVICE_ROLE_KEY',
  'E2E_SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const;

const parseDotEnv = (content: string) => {
  const values: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    const commentIndex = value.search(/\s+#/);
    if (commentIndex >= 0 && !value.startsWith('"') && !value.startsWith("'")) {
      value = value.slice(0, commentIndex).trim();
    }

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

export const getProjectRefFromUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    return url.hostname.split('.')[0] || '';
  } catch {
    return '';
  }
};

const requireE2EEmail = (value: string, key: string) => {
  if (!/^e2e\+[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(value)) {
    throw new Error(`${key} must use an e2e+... email address. Received: ${value}`);
  }
};

export const assertE2EEmail = (value: string) => {
  requireE2EEmail(value, 'email');
};

export const assertE2EName = (value: string) => {
  if (!String(value || '').startsWith('E2E ')) {
    throw new Error(`E2E record names/titles must start with "E2E ". Received: ${value}`);
  }
};

export const isProtectedProjectBypassEnabled = (
  env: Pick<E2EEnv, 'E2E_DANGEROUS_ALLOW_PROTECTED_PROJECT'>,
) => env.E2E_DANGEROUS_ALLOW_PROTECTED_PROJECT === DANGEROUS_PROTECTED_PROJECT_BYPASS_VALUE;

export const assertE2ETarget = (
  env: Pick<
    E2EEnv,
    'E2E_SUPABASE_URL' | 'E2E_SUPABASE_SERVICE_ROLE_KEY' | 'E2E_DANGEROUS_ALLOW_PROTECTED_PROJECT'
  >,
) => {
  const projectRef = getProjectRefFromUrl(env.E2E_SUPABASE_URL);

  if (!projectRef) {
    throw new Error('E2E_SUPABASE_URL must be a valid Supabase project URL.');
  }

  if (projectRef === CURRENT_NON_E2E_PROJECT_REF && !isProtectedProjectBypassEnabled(env)) {
    throw new Error(
      `Refusing to run E2E tests against non-E2E Supabase project ${CURRENT_NON_E2E_PROJECT_REF}. ` +
      'Create a dedicated E2E project or point a safe env file at one. ' +
      `For a deliberate one-off bypass, set ${DANGEROUS_PROTECTED_PROJECT_BYPASS_KEY}=` +
      `${DANGEROUS_PROTECTED_PROJECT_BYPASS_VALUE}.`,
    );
  }

  if (/placeholder|your-|example/i.test(env.E2E_SUPABASE_URL)) {
    throw new Error('E2E_SUPABASE_URL still looks like an example value.');
  }

  if (!env.E2E_SUPABASE_SERVICE_ROLE_KEY || env.E2E_SUPABASE_SERVICE_ROLE_KEY.length < 40) {
    throw new Error('E2E_SUPABASE_SERVICE_ROLE_KEY/E2E_SUPABASE_SECRET_KEY is missing or too short.');
  }
};

const resolveEnvFile = () => {
  const explicitEnvPath = process.env.E2E_ENV_FILE
    ? resolve(repoRoot, process.env.E2E_ENV_FILE)
    : null;

  const candidates = [
    explicitEnvPath,
    envPath,
    rootEnvPath,
  ].filter((candidate): candidate is string => Boolean(candidate));

  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(
      `Missing E2E env file. Checked ${candidates.join(', ')}. ` +
      'Copy .env.e2e.example to .env.e2e, or provide a safe root .env that points at a dedicated E2E Supabase project.',
    );
  }

  return {
    sourcePath,
    fileValues: parseDotEnv(readFileSync(sourcePath, 'utf8')),
  };
};

const firstValue = (fileValues: Record<string, string>, keys: readonly string[]) => {
  for (const key of keys) {
    const fromProcess = String(process.env[key] || '').trim();
    if (fromProcess) return fromProcess;

    const fromFile = String(fileValues[key] || '').trim();
    if (fromFile) return fromFile;
  }

  return '';
};

export const loadE2EEnv = (): E2EEnv => {
  if (cachedEnv) return cachedEnv;

  const { sourcePath, fileValues } = resolveEnvFile();
  const normalizedValues = {
    E2E_SUPABASE_URL: firstValue(fileValues, [
      'E2E_SUPABASE_URL',
      'SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_URL',
    ]),
    E2E_SUPABASE_ANON_KEY: firstValue(fileValues, [
      'E2E_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ]),
    E2E_SUPABASE_SERVICE_ROLE_KEY: firstValue(fileValues, adminDataKeyAliases),
    E2E_ADMIN_EMAIL: firstValue(fileValues, ['E2E_ADMIN_EMAIL']) || 'e2e+admin@musikalokal.test',
    E2E_ADMIN_PASSWORD: firstValue(fileValues, ['E2E_ADMIN_PASSWORD']) || 'E2E-password-123',
    E2E_MOBILE_APP_ID: firstValue(fileValues, ['E2E_MOBILE_APP_ID']) || 'com.anonymous.musikalokal',
    E2E_WEB_BASE_URL: firstValue(fileValues, ['E2E_WEB_BASE_URL']) || 'http://localhost:8082',
    EXPO_PUBLIC_E2E: firstValue(fileValues, ['EXPO_PUBLIC_E2E']) || '1',
    E2E_DANGEROUS_ALLOW_PROTECTED_PROJECT: firstValue(fileValues, [
      DANGEROUS_PROTECTED_PROJECT_BYPASS_KEY,
    ]),
  };

  const missing = requiredKeys.filter((key) => !String(normalizedValues[key] || '').trim());
  if (missing.length > 0) {
    const sourceLabel = sourcePath === rootEnvPath ? 'root .env fallback' : sourcePath;
    const projectRef = getProjectRefFromUrl(normalizedValues.E2E_SUPABASE_URL);
    const bypassEnabled = isProtectedProjectBypassEnabled(normalizedValues);
    const missingLabels = missing.map((key) => (
      key === 'E2E_SUPABASE_SERVICE_ROLE_KEY'
        ? 'E2E_SUPABASE_SERVICE_ROLE_KEY/E2E_SUPABASE_SECRET_KEY'
        : key
    ));
    const issues = [
      `missing required E2E value(s): ${missingLabels.join(', ')}`,
    ];

    if (projectRef === CURRENT_NON_E2E_PROJECT_REF && !bypassEnabled) {
      issues.push(`points at protected non-E2E project ${CURRENT_NON_E2E_PROJECT_REF}`);
    }

    if (/placeholder|your-|example/i.test(normalizedValues.E2E_SUPABASE_URL)) {
      issues.push('still contains an example Supabase URL');
    }

    throw new Error(
      `${sourceLabel} cannot be used for E2E: ${issues.join('; ')}. ` +
      'A root .env fallback may use EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY aliases, ' +
      `but it still needs one admin data key alias: ${adminDataKeyAliases.join(', ')}.`,
    );
  }

  const env: E2EEnv = {
    E2E_SUPABASE_URL: normalizedValues.E2E_SUPABASE_URL.trim(),
    E2E_SUPABASE_ANON_KEY: normalizedValues.E2E_SUPABASE_ANON_KEY.trim(),
    E2E_SUPABASE_SERVICE_ROLE_KEY: normalizedValues.E2E_SUPABASE_SERVICE_ROLE_KEY.trim(),
    E2E_ADMIN_EMAIL: normalizedValues.E2E_ADMIN_EMAIL.trim().toLowerCase(),
    E2E_ADMIN_PASSWORD: normalizedValues.E2E_ADMIN_PASSWORD.trim(),
    E2E_MOBILE_APP_ID: normalizedValues.E2E_MOBILE_APP_ID.trim(),
    E2E_WEB_BASE_URL: normalizedValues.E2E_WEB_BASE_URL.trim(),
    EXPO_PUBLIC_E2E: normalizedValues.EXPO_PUBLIC_E2E.trim(),
    E2E_RUN_ID: process.env.E2E_RUN_ID || `e2e-${Date.now()}`,
    E2E_DANGEROUS_ALLOW_PROTECTED_PROJECT:
      normalizedValues.E2E_DANGEROUS_ALLOW_PROTECTED_PROJECT.trim() || undefined,
  };

  try {
    assertE2ETarget(env);
    requireE2EEmail(env.E2E_ADMIN_EMAIL, 'E2E_ADMIN_EMAIL');
  } catch (error: any) {
    const sourceLabel = sourcePath === rootEnvPath ? 'root .env fallback' : sourcePath;
    throw new Error(`${sourceLabel} cannot be used for E2E: ${error?.message || error}`);
  }

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  process.env.E2E_ENV_FILE = sourcePath;
  process.env.EXPO_PUBLIC_E2E = env.EXPO_PUBLIC_E2E;
  process.env.EXPO_PUBLIC_SUPABASE_URL = env.E2E_SUPABASE_URL;
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = env.E2E_SUPABASE_ANON_KEY;

  cachedEnv = env;
  return env;
};

export const getChildProcessEnv = (env = loadE2EEnv()): Record<string, string> => {
  const merged = {
    ...process.env,
    ...env,
    E2E_ENV_FILE: process.env.E2E_ENV_FILE || envPath,
    EXPO_PUBLIC_E2E: env.EXPO_PUBLIC_E2E,
    EXPO_PUBLIC_SUPABASE_URL: env.E2E_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: env.E2E_SUPABASE_ANON_KEY,
  };

  return Object.fromEntries(
    Object.entries(merged).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;
};

export const makeRunId = (suffix = '') => {
  const normalizedSuffix = suffix ? `-${suffix.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()}` : '';
  return `${loadE2EEnv().E2E_RUN_ID}${normalizedSuffix}`;
};
