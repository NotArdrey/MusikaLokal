import { exec, execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { delimiter, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadE2EEnv } from './env';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
let metroProcess: ChildProcessWithoutNullStreams | null = null;
let metroReady = false;
let metroOutput = '';

const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

const commandName = (name: string) => {
  if (process.platform !== 'win32') return name;
  return name === 'maestro' ? 'maestro.bat' : `${name}.exe`;
};

const isTransientAdbError = (error: any) => {
  const output = `${error?.message || ''}\n${error?.stdout || ''}\n${error?.stderr || ''}`;
  return /adb server|daemon|cannot connect to daemon|failed to start daemon|could not read ok|device offline|closed|protocol fault|shell input (?:keyevent|text)|adb(?:\.exe)? shell pm clear|adb(?:\.exe)? shell am force-stop/i.test(output);
};

const execAdbFileWithRetry = async (
  args: string[],
  options: { timeout: number; env: NodeJS.ProcessEnv },
) => {
  let lastError: any;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await execFileAsync(commandName('adb'), args, options);
    } catch (error: any) {
      lastError = error;
      if (!isTransientAdbError(error) || attempt === 2) {
        throw error;
      }

      await delay(1_000);
      await execFileAsync(commandName('adb'), ['start-server'], {
        timeout: 15_000,
        env: options.env,
      }).catch(() => undefined);
      await delay(1_000);
    }
  }

  throw lastError;
};

const quoteWindowsCmdArg = (value: string) => `"${value.replace(/%/g, '%%').replace(/"/g, '^"')}"`;

const toBase64Url = (value: string) => Buffer
  .from(value, 'utf8')
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const getChildEnvWithAndroidTools = (extraEnv: Record<string, string> = {}) => {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const currentPath = String(process.env[pathKey] || process.env.PATH || '');
  const androidToolDirs = [
    process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'platform-tools') : '',
    process.env.ANDROID_SDK_ROOT ? join(process.env.ANDROID_SDK_ROOT, 'platform-tools') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools') : '',
  ].filter((path) => path && existsSync(path));

  return {
    ...process.env,
    [pathKey]: [...androidToolDirs, currentPath].filter(Boolean).join(delimiter),
    ...extraEnv,
  };
};

const metroStatusUrl = () => `http://127.0.0.1:${process.env.E2E_METRO_PORT || '8081'}/status`;

const isMetroRunning = async () => {
  try {
    const response = await fetch(metroStatusUrl(), { signal: AbortSignal.timeout(2_000) });
    const body = await response.text();
    return response.ok && /packager-status:running/i.test(body);
  } catch {
    return false;
  }
};

const waitForMetro = async () => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    if (await isMetroRunning()) {
      metroReady = true;
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }

  throw new Error(
    [
      `Metro did not become ready at ${metroStatusUrl()}.`,
      metroOutput.trim() ? `Recent Metro output:\n${metroOutput.trim().slice(-4_000)}` : '',
    ].filter(Boolean).join('\n\n'),
  );
};

const waitForAndroidBoot = async () => {
  const childEnv = getChildEnvWithAndroidTools();
  const startedAt = Date.now();

  while (Date.now() - startedAt < 180_000) {
    try {
      const { stdout } = await execAdbFileWithRetry(['shell', 'getprop', 'sys.boot_completed'], {
        timeout: 15_000,
        env: childEnv,
      });
      if (stdout.trim() === '1') {
        return;
      }
    } catch {
      // Keep polling; adb can briefly report offline while the emulator finishes booting.
    }

    await delay(2_000);
  }

  throw new Error('Android emulator did not finish booting within 180 seconds.');
};

const ensureMetroForDevBuild = async () => {
  const env = loadE2EEnv();
  const port = process.env.E2E_METRO_PORT || '8081';

  if (await isMetroRunning()) {
    metroReady = true;
  } else {
    metroReady = false;
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    metroProcess = spawn(
      command,
      ['expo', 'start', '--dev-client', '--host', 'lan', '--port', port],
      {
        cwd: resolve(__dirname, '..', '..', 'mobile'),
        shell: process.platform === 'win32',
        env: getChildEnvWithAndroidTools({
          EXPO_PUBLIC_E2E: env.EXPO_PUBLIC_E2E,
          EXPO_PUBLIC_SUPABASE_URL: env.E2E_SUPABASE_URL,
          EXPO_PUBLIC_SUPABASE_ANON_KEY: env.E2E_SUPABASE_ANON_KEY,
          E2E_ENV_FILE: process.env.E2E_ENV_FILE || '',
        }),
      },
    );

    const appendOutput = (chunk: Buffer) => {
      metroOutput = `${metroOutput}${chunk.toString()}`.slice(-8_000);
    };
    metroProcess.stdout.on('data', appendOutput);
    metroProcess.stderr.on('data', appendOutput);
    metroProcess.on('exit', (code) => {
      if (!metroReady) {
        metroOutput = `${metroOutput}\nMetro exited before becoming ready (code ${code}).`.slice(-8_000);
      }
      metroReady = false;
      metroProcess = null;
    });

    await waitForMetro();
  }

  await execAdbFileWithRetry(['reverse', `tcp:${port}`, `tcp:${port}`], {
    timeout: 15_000,
    env: getChildEnvWithAndroidTools(),
  });
};

const resetAndWarmLaunchApp = async (appId: string) => {
  const childEnv = getChildEnvWithAndroidTools();
  await execAdbFileWithRetry(['shell', 'am', 'force-stop', appId], {
    timeout: 60_000,
    env: childEnv,
  });
  await execAdbFileWithRetry(['shell', 'pm', 'clear', appId], {
    timeout: 30_000,
    env: childEnv,
  });
  await launchAndroidApp(appId);
  await delay(105_000);
  await execAdbFileWithRetry(['shell', 'am', 'force-stop', appId], {
    timeout: 60_000,
    env: childEnv,
  });
};

const escapeAdbInputText = (value: string) => value
  .replace(/%/g, '%25')
  .replace(/\s/g, '%s')
  .replace(/([\\`"$&|;<>()])/g, '\\$1');

const inputTextWithAdb = async (value: string) => {
  const childEnv = getChildEnvWithAndroidTools();
  const chunkSize = 10;

  for (let index = 0; index < value.length; index += chunkSize) {
    const text = escapeAdbInputText(value.slice(index, index + chunkSize));
    await execAdbFileWithRetry(['shell', 'input', 'text', text], {
      timeout: 30_000,
      env: childEnv,
    });
    await delay(500);
  }
};

const replaceTextWithAdb = async (value: string) => {
  await eraseTextWithAdb(120);
  await inputTextWithAdb(value);
};

const eraseTextWithAdb = async (characters = 80) => {
  const childEnv = getChildEnvWithAndroidTools();
  await execAdbFileWithRetry(['shell', 'input', 'keyevent', '123'], {
    timeout: 15_000,
    env: childEnv,
  });

  for (let remaining = characters; remaining > 0; remaining -= 5) {
    const count = Math.min(5, remaining);
    await execAdbFileWithRetry([
      'shell',
      'input',
      'keyevent',
      ...Array.from({ length: count }, () => '67'),
    ], {
      timeout: 30_000,
      env: childEnv,
    });
  }
};

const hideKeyboardWithAdb = async () => {
  const childEnv = getChildEnvWithAndroidTools();
  await execAdbFileWithRetry(['shell', 'input', 'keyevent', '4'], {
    timeout: 15_000,
    env: childEnv,
  });
  await delay(1_000);
};

const getAndroidScreenSize = async () => {
  const childEnv = getChildEnvWithAndroidTools();
  const { stdout } = await execAdbFileWithRetry(['shell', 'wm', 'size'], {
    timeout: 15_000,
    env: childEnv,
  });
  const match = stdout.match(/Physical size:\s*(\d+)x(\d+)/i);
  if (!match) {
    return { width: 1080, height: 2400 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
};

const tapScreenFractionWithAdb = async (xRatio: number, yRatio: number) => {
  const childEnv = getChildEnvWithAndroidTools();
  const { width, height } = await getAndroidScreenSize();
  await execAdbFileWithRetry([
    'shell',
    'input',
    'tap',
    String(Math.round(width * xRatio)),
    String(Math.round(height * yRatio)),
  ], {
    timeout: 15_000,
    env: childEnv,
  });
  await delay(700);
};

const launchAndroidApp = async (appId: string) => {
  const childEnv = getChildEnvWithAndroidTools();

  try {
    await execAdbFileWithRetry(['shell', 'monkey', '-p', appId, '1'], {
      timeout: 180_000,
      env: childEnv,
    });
    return;
  } catch (monkeyError) {
    try {
      await execAdbFileWithRetry([
        'shell',
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.MAIN',
        '-c',
        'android.intent.category.LAUNCHER',
        '-n',
        `${appId}/.MainActivity`,
      ], {
        timeout: 180_000,
        env: childEnv,
      });
      return;
    } catch (startError: any) {
      const monkeyOutput = `${(monkeyError as any)?.message || ''}\n${(monkeyError as any)?.stdout || ''}\n${(monkeyError as any)?.stderr || ''}`.trim();
      const startOutput = `${startError?.message || ''}\n${startError?.stdout || ''}\n${startError?.stderr || ''}`.trim();
      throw new Error(
        [
          `Failed to launch ${appId}.`,
          monkeyOutput ? `monkey output:\n${monkeyOutput}` : '',
          startOutput ? `am start output:\n${startOutput}` : '',
        ].filter(Boolean).join('\n\n'),
      );
    }
  }
};

const runMaestroCliFlow = async (
  flowName: string,
  extraEnv: Record<string, string> = {},
  timeout = 300_000,
) => {
  const flowPath = resolve(__dirname, '..', 'maestro', flowName);
  await runMaestroCliPath(flowName, flowPath, extraEnv, timeout);
};

const isTransientMaestroCliError = (error: any) => {
  const output = `${error?.message || ''}\n${error?.stdout || ''}\n${error?.stderr || ''}`;
  return /StatusRuntimeException:\s*(?:UNAVAILABLE|DEADLINE_EXCEEDED)|tcp:\d+\): closed|viewHierarchy|inputText/i.test(output);
};

const runMaestroCliPath = async (
  flowName: string,
  flowPath: string,
  extraEnv: Record<string, string> = {},
  timeout = 300_000,
) => {
  const env = loadE2EEnv();
  const args = [
    'test',
    '-e',
    `APP_ID=${env.E2E_MOBILE_APP_ID}`,
    '-e',
    `E2E_ADMIN_EMAIL=${env.E2E_ADMIN_EMAIL}`,
    '-e',
    `E2E_ADMIN_PASSWORD=${env.E2E_ADMIN_PASSWORD}`,
  ];

  for (const [key, value] of Object.entries(extraEnv)) {
    args.push('-e', `${key}=${value}`);
  }

  args.push(flowPath);

  const childEnv = getChildEnvWithAndroidTools({
    ...extraEnv,
    APP_ID: env.E2E_MOBILE_APP_ID,
  });
  let lastError: any;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (process.platform === 'win32') {
        const commandLine = `call ${commandName('maestro')} ${args.map(quoteWindowsCmdArg).join(' ')}`;
        await execAsync(commandLine, {
          timeout,
          env: childEnv,
        });
        return;
      }

      await execFileAsync(commandName('maestro'), args, {
        timeout,
        env: childEnv,
      });
      return;
    } catch (error: any) {
      lastError = error;
      if (!isTransientMaestroCliError(error) || attempt === 2) {
        break;
      }

      await execAdbFileWithRetry(['start-server'], {
        timeout: 15_000,
        env: childEnv,
      }).catch(() => undefined);
      await delay(2_000);
    }
  }

  const stdout = String(lastError?.stdout || '').trim();
  const stderr = String(lastError?.stderr || '').trim();
  throw new Error(
    [
      `Maestro flow failed: ${flowName}`,
      stdout ? `stdout:\n${stdout}` : '',
      stderr ? `stderr:\n${stderr}` : '',
      lastError?.message || '',
    ].filter(Boolean).join('\n\n'),
  );
};

const getFlowParts = (content: string) => {
  const match = content.match(/^---\s*$/m);
  if (!match || match.index === undefined) {
    throw new Error('Maestro flow is missing a document separator (---).');
  }

  return {
    header: content.slice(0, match.index).trimEnd(),
    body: content.slice(match.index + match[0].length).trim(),
  };
};

const splitFlowCommands = (body: string) => {
  const commands: string[] = [];
  let current: string[] = [];

  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('- ')) {
      if (current.length > 0) {
        commands.push(current.join('\n'));
      }
      current = [line];
    } else if (current.length > 0 || line.trim()) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    commands.push(current.join('\n'));
  }

  return commands;
};

const resolveFlowValue = (rawValue: string, extraEnv: Record<string, string>) => {
  const env = loadE2EEnv();
  const unquoted = rawValue.trim().replace(/^["'](.*)["']$/, '$1');

  return unquoted.replace(/\$\{([^}]+)\}/g, (_, key: string) => (
    extraEnv[key] || process.env[key] || (env as any)[key] || ''
  ));
};

const writeSegmentFlow = (header: string, commands: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'musikalokal-maestro-'));
  const segmentPath = join(dir, 'segment.yaml');
  writeFileSync(segmentPath, `${header}\n---\n${commands.join('\n')}\n`, 'utf8');
  return segmentPath;
};

const runMaestroFlowWithAdbText = async (
  flowName: string,
  extraEnv: Record<string, string> = {},
  timeout = 300_000,
) => {
  const sourcePath = resolve(__dirname, '..', 'maestro', flowName);
  const { header, body } = getFlowParts(readFileSync(sourcePath, 'utf8'));
  const commands = splitFlowCommands(body);
  const pending: string[] = [];
  let segmentIndex = 0;

  const flush = async () => {
    if (pending.length === 0) return;
    segmentIndex += 1;
    const segmentPath = writeSegmentFlow(header, pending.splice(0, pending.length));
    await runMaestroCliPath(`${flowName}#${segmentIndex}`, segmentPath, extraEnv, timeout);
  };

  for (const command of commands) {
    const trimmed = command.trim();
    const inputMatch = trimmed.match(/^- inputText:\s*(.+)$/s);
    const eraseMatch = trimmed.match(/^- eraseText(?::\s*(\d+))?/);

    if (inputMatch) {
      await flush();
      await inputTextWithAdb(resolveFlowValue(inputMatch[1], extraEnv));
      continue;
    }

    if (eraseMatch) {
      await flush();
      await eraseTextWithAdb(eraseMatch[1] ? Number(eraseMatch[1]) : 80);
      continue;
    }

    pending.push(command);
  }

  await flush();
};

const runMobileLoginFlow = async (extraEnv: Record<string, string>) => {
  const env = loadE2EEnv();
  const email = extraEnv.E2E_MOBILE_EMAIL;
  const password = extraEnv.E2E_MOBILE_PASSWORD;
  if (!email || !password) {
    throw new Error('Mobile login flow requires E2E_MOBILE_EMAIL and E2E_MOBILE_PASSWORD.');
  }

  await resetAndWarmLaunchApp(env.E2E_MOBILE_APP_ID);
  await ensureMetroForDevBuild();
  await runMaestroCliFlow('mobile-e2e-login.yaml', {
    ...extraEnv,
    E2E_MOBILE_LOGIN_URL: `musikalokal://e2e-login?email_b64=${toBase64Url(email)}&password_b64=${toBase64Url(password)}`,
  }, 240_000);
};

const nativeInputMaestroFlows = new Set([
  'mobile-booking-cancel.yaml',
  'mobile-booking-report-access.yaml',
  'mobile-booking-report-late.yaml',
  'mobile-gig-application-withdraw.yaml',
]);

export async function requireAndroidApp() {
  const env = loadE2EEnv();
  const childEnv = getChildEnvWithAndroidTools();

  let devicesOutput = '';
  try {
    const { stdout } = await execAdbFileWithRetry(['devices'], {
      timeout: 15_000,
      env: childEnv,
    });
    devicesOutput = stdout;
  } catch (error: any) {
    throw new Error(`Android app/emulator is unavailable: adb failed (${error?.message || error}).`);
  }

  const devices = devicesOutput
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice') || /\sdevice$/.test(line));

  if (devices.length === 0) {
    throw new Error('Android app/emulator is unavailable: no adb device is connected.');
  }

  await waitForAndroidBoot();

  try {
    const { stdout } = await execAdbFileWithRetry(
      ['shell', 'pm', 'path', env.E2E_MOBILE_APP_ID],
      { timeout: 180_000, env: childEnv },
    );

    if (!stdout.includes('package:')) {
      throw new Error(stdout || 'package path not found');
    }
  } catch (error: any) {
    const debugApkPath = resolve(__dirname, '..', '..', 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (!existsSync(debugApkPath)) {
      throw new Error(
        `Android app/emulator is unavailable: ${env.E2E_MOBILE_APP_ID} is not installed (${error?.message || error}).`,
      );
    }

    await execAdbFileWithRetry(['install', '-r', debugApkPath], {
      timeout: 300_000,
      env: childEnv,
    });

    const { stdout } = await execAdbFileWithRetry(
      ['shell', 'pm', 'path', env.E2E_MOBILE_APP_ID],
      { timeout: 180_000, env: childEnv },
    );

    if (!stdout.includes('package:')) {
      throw new Error(`Android app/emulator is unavailable: failed to install ${env.E2E_MOBILE_APP_ID}.`);
    }
  }

  await ensureMetroForDevBuild();
}

export async function runMaestroFlow(flowName: string, extraEnv: Record<string, string> = {}) {
  loadE2EEnv();
  await ensureMetroForDevBuild();
  if (flowName === 'mobile-login.yaml') {
    await runMobileLoginFlow(extraEnv);
    return;
  }

  if (nativeInputMaestroFlows.has(flowName)) {
    await runMaestroCliFlow(flowName, extraEnv);
    return;
  }

  await runMaestroFlowWithAdbText(flowName, extraEnv);
}

export async function resetMobileAppForMaestro() {
  const env = loadE2EEnv();
  await resetAndWarmLaunchApp(env.E2E_MOBILE_APP_ID);
  await ensureMetroForDevBuild();
}
