import { test } from '@playwright/test';

const pagesToCapture = [
  { path: '/shop', name: 'shop' },
  { path: '/orders', name: 'orders' },
  { path: '/edit_profile', name: 'edit_profile' },
  { path: '/edit_group', name: 'edit_group' },
];

test('Capture Screenshots', async ({ page }) => {
  // Increase timeout to wait for the Expo dev server to compile
  test.setTimeout(120000);

  for (const { path, name } of pagesToCapture) {
    await page.goto(`http://localhost:8083${path}`, { waitUntil: 'networkidle' });
    
    // Additional wait for potential animations/data loading
    await page.waitForTimeout(2000);
    
    // Ensure the artifact path matches the conversation dir
    await page.screenshot({ path: `../../brain/fddbbff4-c0cc-4d66-af4d-321c91cb2130/screenshots/${name}.png`, fullPage: true });
  }
});
