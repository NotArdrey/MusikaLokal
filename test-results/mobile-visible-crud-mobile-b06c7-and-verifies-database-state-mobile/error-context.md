# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile\visible-crud.spec.ts >> mobile visible CRUD flows >> updates profile through mobile UI and verifies database state
- Location: e2e\tests\mobile\visible-crud.spec.ts:196:7

# Error details

```
Error: Maestro flow failed: mobile-profile-update.yaml#3

stdout:
E:\React-Native-Projects\MusikaLokal>if "Windows_NT" == "Windows_NT" setlocal

E:\React-Native-Projects\MusikaLokal>set DIRNAME=C:\Users\kngtr\AppData\Local\Programs\maestro-cli\cli-2.5.1\maestro\bin\ 

E:\React-Native-Projects\MusikaLokal>if "C:\Users\kngtr\AppData\Local\Programs\maestro-cli\cli-2.5.1\maestro\bin\" == "" set DIRNAME=. 

E:\React-Native-Projects\MusikaLokal>set APP_BASE_NAME=maestro 

E:\React-Native-Projects\MusikaLokal>set APP_HOME=C:\Users\kngtr\AppData\Local\Programs\maestro-cli\cli-2.5.1\maestro\bin\.. 

E:\React-Native-Projects\MusikaLokal>for %i in ("C:\Users\kngtr\AppData\Local\Programs\maestro-cli\cli-2.5.1\maestro\bin\..") do set APP_HOME=%~fi 

E:\React-Native-Projects\MusikaLokal>set APP_HOME=C:\Users\kngtr\AppData\Local\Programs\maestro-cli\cli-2.5.1\maestro 

E:\React-Native-Projects\MusikaLokal>set DEFAULT_JVM_OPTS= 

E:\React-Native-Projects\MusikaLokal>if defined JAVA_HOME goto findJavaFromJavaHome 

E:\React-Native-Projects\MusikaLokal>set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot 

E:\React-Native-Projects\MusikaLokal>set JAVA_EXE=C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot/bin/java.exe 

E:\React-Native-Projects\MusikaLokal>if exist "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot/bin/java.exe" goto execute 

E:\React-Native-Projects\MusikaLokal>set CLASSPATH=C:\Users\kngtr\AppData\Local\Programs\maestro-cli\cli-2.5.1\maestro\lib\* 

E:\React-Native-Projects\MusikaLokal>set JAVA_VERSION=0 

E:\React-Native-Projects\MusikaLokal>for /F "tokens=*" %g in ('cmd /c ""C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot/bin/java.exe" -classpath "C:\Users\kngtr\AppData\Local\Programs\maestro-cli\cli-2.5.1\maestro\bin\*" JvmVersion"') do (set JAVA_VERSION=%g ) 

E:\React-Native-Projects\MusikaLokal>(set JAVA_VERSION=17 ) 

E:\React-Native-Projects\MusikaLokal>if 17 LSS 17 (
echo. 
 echo ERROR: Java 17 or higher is required.  
 echo. 
 echo Please update Java, then try again.  
 echo To check your Java version, run: java -version  
 echo. 
 echo See https://maestro.dev/blog/introducing-maestro-2-0-0 for more details.  
 goto fail 
) 

E:\React-Native-Projects\MusikaLokal>"C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot/bin/java.exe"     -classpath "C:\Users\kngtr\AppData\Local\Programs\maestro-cli\cli-2.5.1\maestro\lib\*" maestro.cli.AppKt "test" "-e" "APP_ID=com.anonymous.musikalokal" "-e" "E2E_ADMIN_EMAIL=e2e+admin@musikalokal.test" "-e" "E2E_ADMIN_PASSWORD=E2E-password-123" "-e" "E2E_PROFILE_CONTACT=+639171234567" "-e" "E2E_PROFILE_BIO=Updated mobile bio e2e-1779157456481-profile" "C:\Users\kngtr\AppData\Local\Temp\musikalokal-maestro-ri1kmc\segment.yaml" 
Running on Medium_Phone_API_36.1
 > Flow segment
Hide Keyboard... COMPLETED
Scrolling DOWN until id: mobile-profile-save-button is visible with speed 80, visibility percentage 50%, timeout 60000 ms, with centering enabled... COMPLETED
Tap on id: mobile-profile-save-button... COMPLETED
Wait for animation to end within 2000 ms... COMPLETED
Tap on id: mobile-profile-save-button... FAILED

Element not found: Id matching regex: mobile-profile-save-button

Element with Id matching regex: mobile-profile-save-button not found. Check the UI hierarchy in debug artifacts to verify if the element exists.

Possible causes:
- Element selector may be incorrect - check if there are similar elements with slightly different names/properties.
- Element may be temporarily unavailable due to loading state.
- This could be a real regression that needs to be addressed.

==== Debug output (logs & screenshots) ====

C:\Users\kngtr\.maestro\tests\2026-05-19_102745

E:\React-Native-Projects\MusikaLokal>if 1 EQU 0 goto mainEnd 

E:\React-Native-Projects\MusikaLokal>rem Set variable MAESTRO_EXIT_CONSOLE if you need the _script_ return code instead of 

E:\React-Native-Projects\MusikaLokal>rem the _cmd.exe /c_ return code! 

E:\React-Native-Projects\MusikaLokal>set EXIT_CODE=1 

E:\React-Native-Projects\MusikaLokal>if 1 EQU 0 set EXIT_CODE=1 

E:\React-Native-Projects\MusikaLokal>if not "" == "" exit 1 

E:\React-Native-Projects\MusikaLokal>exit /b 1

Command failed: call maestro.bat "test" "-e" "APP_ID=com.anonymous.musikalokal" "-e" "E2E_ADMIN_EMAIL=e2e+admin@musikalokal.test" "-e" "E2E_ADMIN_PASSWORD=E2E-password-123" "-e" "E2E_PROFILE_CONTACT=+639171234567" "-e" "E2E_PROFILE_BIO=Updated mobile bio e2e-1779157456481-profile" "C:\Users\kngtr\AppData\Local\Temp\musikalokal-maestro-ri1kmc\segment.yaml"

```

# Test source

```ts
  298 |         '-a',
  299 |         'android.intent.action.MAIN',
  300 |         '-c',
  301 |         'android.intent.category.LAUNCHER',
  302 |         '-n',
  303 |         `${appId}/.MainActivity`,
  304 |       ], {
  305 |         timeout: 180_000,
  306 |         env: childEnv,
  307 |       });
  308 |       return;
  309 |     } catch (startError: any) {
  310 |       const monkeyOutput = `${(monkeyError as any)?.message || ''}\n${(monkeyError as any)?.stdout || ''}\n${(monkeyError as any)?.stderr || ''}`.trim();
  311 |       const startOutput = `${startError?.message || ''}\n${startError?.stdout || ''}\n${startError?.stderr || ''}`.trim();
  312 |       throw new Error(
  313 |         [
  314 |           `Failed to launch ${appId}.`,
  315 |           monkeyOutput ? `monkey output:\n${monkeyOutput}` : '',
  316 |           startOutput ? `am start output:\n${startOutput}` : '',
  317 |         ].filter(Boolean).join('\n\n'),
  318 |       );
  319 |     }
  320 |   }
  321 | };
  322 | 
  323 | const runMaestroCliFlow = async (
  324 |   flowName: string,
  325 |   extraEnv: Record<string, string> = {},
  326 |   timeout = 300_000,
  327 | ) => {
  328 |   const flowPath = resolve(__dirname, '..', 'maestro', flowName);
  329 |   await runMaestroCliPath(flowName, flowPath, extraEnv, timeout);
  330 | };
  331 | 
  332 | const isTransientMaestroCliError = (error: any) => {
  333 |   const output = `${error?.message || ''}\n${error?.stdout || ''}\n${error?.stderr || ''}`;
  334 |   return /StatusRuntimeException:\s*(?:UNAVAILABLE|DEADLINE_EXCEEDED)|tcp:\d+\): closed|viewHierarchy|inputText/i.test(output);
  335 | };
  336 | 
  337 | const runMaestroCliPath = async (
  338 |   flowName: string,
  339 |   flowPath: string,
  340 |   extraEnv: Record<string, string> = {},
  341 |   timeout = 300_000,
  342 | ) => {
  343 |   const env = loadE2EEnv();
  344 |   const args = [
  345 |     'test',
  346 |     '-e',
  347 |     `APP_ID=${env.E2E_MOBILE_APP_ID}`,
  348 |     '-e',
  349 |     `E2E_ADMIN_EMAIL=${env.E2E_ADMIN_EMAIL}`,
  350 |     '-e',
  351 |     `E2E_ADMIN_PASSWORD=${env.E2E_ADMIN_PASSWORD}`,
  352 |   ];
  353 | 
  354 |   for (const [key, value] of Object.entries(extraEnv)) {
  355 |     args.push('-e', `${key}=${value}`);
  356 |   }
  357 | 
  358 |   args.push(flowPath);
  359 | 
  360 |   const childEnv = getChildEnvWithAndroidTools({
  361 |     ...extraEnv,
  362 |     APP_ID: env.E2E_MOBILE_APP_ID,
  363 |   });
  364 |   let lastError: any;
  365 | 
  366 |   for (let attempt = 0; attempt < 3; attempt += 1) {
  367 |     try {
  368 |       if (process.platform === 'win32') {
  369 |         const commandLine = `call ${commandName('maestro')} ${args.map(quoteWindowsCmdArg).join(' ')}`;
  370 |         await execAsync(commandLine, {
  371 |           timeout,
  372 |           env: childEnv,
  373 |         });
  374 |         return;
  375 |       }
  376 | 
  377 |       await execFileAsync(commandName('maestro'), args, {
  378 |         timeout,
  379 |         env: childEnv,
  380 |       });
  381 |       return;
  382 |     } catch (error: any) {
  383 |       lastError = error;
  384 |       if (!isTransientMaestroCliError(error) || attempt === 2) {
  385 |         break;
  386 |       }
  387 | 
  388 |       await execAdbFileWithRetry(['start-server'], {
  389 |         timeout: 15_000,
  390 |         env: childEnv,
  391 |       }).catch(() => undefined);
  392 |       await delay(2_000);
  393 |     }
  394 |   }
  395 | 
  396 |   const stdout = String(lastError?.stdout || '').trim();
  397 |   const stderr = String(lastError?.stderr || '').trim();
> 398 |   throw new Error(
      |         ^ Error: Maestro flow failed: mobile-profile-update.yaml#3
  399 |     [
  400 |       `Maestro flow failed: ${flowName}`,
  401 |       stdout ? `stdout:\n${stdout}` : '',
  402 |       stderr ? `stderr:\n${stderr}` : '',
  403 |       lastError?.message || '',
  404 |     ].filter(Boolean).join('\n\n'),
  405 |   );
  406 | };
  407 | 
  408 | const getFlowParts = (content: string) => {
  409 |   const match = content.match(/^---\s*$/m);
  410 |   if (!match || match.index === undefined) {
  411 |     throw new Error('Maestro flow is missing a document separator (---).');
  412 |   }
  413 | 
  414 |   return {
  415 |     header: content.slice(0, match.index).trimEnd(),
  416 |     body: content.slice(match.index + match[0].length).trim(),
  417 |   };
  418 | };
  419 | 
  420 | const splitFlowCommands = (body: string) => {
  421 |   const commands: string[] = [];
  422 |   let current: string[] = [];
  423 | 
  424 |   for (const line of body.split(/\r?\n/)) {
  425 |     if (line.startsWith('- ')) {
  426 |       if (current.length > 0) {
  427 |         commands.push(current.join('\n'));
  428 |       }
  429 |       current = [line];
  430 |     } else if (current.length > 0 || line.trim()) {
  431 |       current.push(line);
  432 |     }
  433 |   }
  434 | 
  435 |   if (current.length > 0) {
  436 |     commands.push(current.join('\n'));
  437 |   }
  438 | 
  439 |   return commands;
  440 | };
  441 | 
  442 | const resolveFlowValue = (rawValue: string, extraEnv: Record<string, string>) => {
  443 |   const env = loadE2EEnv();
  444 |   const unquoted = rawValue.trim().replace(/^["'](.*)["']$/, '$1');
  445 | 
  446 |   return unquoted.replace(/\$\{([^}]+)\}/g, (_, key: string) => (
  447 |     extraEnv[key] || process.env[key] || (env as any)[key] || ''
  448 |   ));
  449 | };
  450 | 
  451 | const writeSegmentFlow = (header: string, commands: string[]) => {
  452 |   const dir = mkdtempSync(join(tmpdir(), 'musikalokal-maestro-'));
  453 |   const segmentPath = join(dir, 'segment.yaml');
  454 |   writeFileSync(segmentPath, `${header}\n---\n${commands.join('\n')}\n`, 'utf8');
  455 |   return segmentPath;
  456 | };
  457 | 
  458 | const runMaestroFlowWithAdbText = async (
  459 |   flowName: string,
  460 |   extraEnv: Record<string, string> = {},
  461 |   timeout = 300_000,
  462 | ) => {
  463 |   const sourcePath = resolve(__dirname, '..', 'maestro', flowName);
  464 |   const { header, body } = getFlowParts(readFileSync(sourcePath, 'utf8'));
  465 |   const commands = splitFlowCommands(body);
  466 |   const pending: string[] = [];
  467 |   let segmentIndex = 0;
  468 | 
  469 |   const flush = async () => {
  470 |     if (pending.length === 0) return;
  471 |     segmentIndex += 1;
  472 |     const segmentPath = writeSegmentFlow(header, pending.splice(0, pending.length));
  473 |     await runMaestroCliPath(`${flowName}#${segmentIndex}`, segmentPath, extraEnv, timeout);
  474 |   };
  475 | 
  476 |   for (const command of commands) {
  477 |     const trimmed = command.trim();
  478 |     const inputMatch = trimmed.match(/^- inputText:\s*(.+)$/s);
  479 |     const eraseMatch = trimmed.match(/^- eraseText(?::\s*(\d+))?/);
  480 | 
  481 |     if (inputMatch) {
  482 |       await flush();
  483 |       await inputTextWithAdb(resolveFlowValue(inputMatch[1], extraEnv));
  484 |       continue;
  485 |     }
  486 | 
  487 |     if (eraseMatch) {
  488 |       await flush();
  489 |       await eraseTextWithAdb(eraseMatch[1] ? Number(eraseMatch[1]) : 80);
  490 |       continue;
  491 |     }
  492 | 
  493 |     pending.push(command);
  494 |   }
  495 | 
  496 |   await flush();
  497 | };
  498 | 
```