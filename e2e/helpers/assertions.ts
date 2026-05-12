import { expect, type Locator, type Page } from '@playwright/test';
import { maybeRecordByColumn, requireRecordByColumn } from './supabase';

export async function expectVisible(locator: Locator, message?: string) {
  await expect(locator, message).toBeVisible();
}

export async function expectUrlContains(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

export async function expectDbRecord<T extends Record<string, unknown>>(
  table: string,
  column: string,
  value: string,
  predicate?: (record: T) => boolean,
) {
  let lastRecord: T | null = null;

  try {
    await expect
      .poll(async () => {
        const record = await maybeRecordByColumn<T>(table, column, value);
        lastRecord = record;
        if (!record) return false;
        return predicate ? predicate(record) : true;
      }, { timeout: 30_000 })
      .toBe(true);
  } catch (error) {
    throw new Error(
      `Expected ${table}.${column}=${value} to satisfy E2E assertion. ` +
        `Last record: ${JSON.stringify(lastRecord)}. ${error}`,
    );
  }

  return requireRecordByColumn<T>(table, column, value);
}

export async function expectNoDbRecord(table: string, column: string, value: string) {
  await expect
    .poll(async () => maybeRecordByColumn(table, column, value), { timeout: 30_000 })
    .toBeNull();
}
