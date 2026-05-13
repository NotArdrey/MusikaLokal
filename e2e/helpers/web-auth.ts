import { expect, type Page } from '@playwright/test';

export async function loginAsAdmin(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill(password);
  await page.getByTestId('auth-sign-in-button').click();
  await expect(page).toHaveURL(/\/admin(?:\/|$)?/, { timeout: 45_000 });
}
