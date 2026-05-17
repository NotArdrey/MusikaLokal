# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin\stations.spec.ts >> admin stations CRUD >> keeps auto-create hidden and opens an empty picker when no playlist source can create a station
- Location: e2e\tests\admin\stations.spec.ts:41:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('admin-stations-empty-title')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByTestId('admin-stations-empty-title')

```

# Test source

```ts
  1  | import { expect, type Locator, type Page } from '@playwright/test';
  2  | import { maybeRecordByColumn, requireRecordByColumn } from './supabase';
  3  | 
  4  | export async function expectVisible(locator: Locator, message?: string) {
> 5  |   await expect(locator, message).toBeVisible();
     |                                  ^ Error: expect(locator).toBeVisible() failed
  6  | }
  7  | 
  8  | export async function expectUrlContains(page: Page, path: string) {
  9  |   await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  10 | }
  11 | 
  12 | export async function expectDbRecord<T extends Record<string, unknown>>(
  13 |   table: string,
  14 |   column: string,
  15 |   value: string,
  16 |   predicate?: (record: T) => boolean,
  17 | ) {
  18 |   let lastRecord: T | null = null;
  19 | 
  20 |   try {
  21 |     await expect
  22 |       .poll(async () => {
  23 |         const record = await maybeRecordByColumn<T>(table, column, value);
  24 |         lastRecord = record;
  25 |         if (!record) return false;
  26 |         return predicate ? predicate(record) : true;
  27 |       }, { timeout: 30_000 })
  28 |       .toBe(true);
  29 |   } catch (error) {
  30 |     throw new Error(
  31 |       `Expected ${table}.${column}=${value} to satisfy E2E assertion. ` +
  32 |         `Last record: ${JSON.stringify(lastRecord)}. ${error}`,
  33 |     );
  34 |   }
  35 | 
  36 |   return requireRecordByColumn<T>(table, column, value);
  37 | }
  38 | 
  39 | export async function expectNoDbRecord(table: string, column: string, value: string) {
  40 |   await expect
  41 |     .poll(async () => maybeRecordByColumn(table, column, value), { timeout: 30_000 })
  42 |     .toBeNull();
  43 | }
  44 | 
```