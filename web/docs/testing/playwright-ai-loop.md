# Playwright AI Test Loop

This web app now has a Playwright setup for browser UI testing and an optional AI-fix loop.

For the unified web + mobile + Supabase-aware loop, prefer:

```bash
npm run test:e2e:smoke
npm run test:e2e:loop
```

The unified runner lives in `../e2e/ai-loop` and writes reports to `../e2e/reports`.

## Run UI Tests Once

```bash
npm run test:ui
```

Playwright starts Expo web on port `8082` unless a server is already running.

## Run The Repeat Loop

```bash
npm run test:ui:loop
```

If tests fail, the loop writes:

```text
.playwright-ai/latest-failure.md
```

That report is formatted for Codex: it includes the failed command, output, JSON results, git status, and a reminder to avoid admin paths.

## Optional Automatic AI Fix Command

Set `AI_FIX_COMMAND` if you want the loop to call a local AI fixer between test attempts:

```bash
$env:AI_FIX_COMMAND='codex exec "Read $env:UI_TEST_FAILURE_REPORT, fix the failing web UI test, do not edit web/app/admin/**, then stop."'
$env:UI_TEST_LOOP_ATTEMPTS='3'
npm run test:ui:loop
```

The loop sets these environment variables for the fixer:

- `UI_TEST_FAILURE_REPORT`
- `UI_TEST_LOOP_ATTEMPT`

## Useful Variables

- `PLAYWRIGHT_PORT=8082`
- `PLAYWRIGHT_BASE_URL=http://localhost:8082`
- `PLAYWRIGHT_SKIP_WEBSERVER=1`
- `UI_TEST_COMMAND="npx playwright test"`
- `UI_TEST_LOOP_ATTEMPTS=3`

## Scope

Tests are web-only and exclude `web/app/admin/**`.
