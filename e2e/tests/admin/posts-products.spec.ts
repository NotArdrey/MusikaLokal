import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord, expectNoDbRecord, expectVisible } from '../../helpers/assertions';
import { seedE2EAdmin, seedE2EFeedPost, seedE2EProduct, seedE2EUser } from '../../helpers/seed';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });

test.describe('admin posts and products moderation CRUD', () => {
  let adminEmail = '';
  let adminPassword = '';

  test.beforeAll(async () => {
    await cleanupE2ERecords();
    const admin = await seedE2EAdmin();
    adminEmail = admin.email;
    adminPassword = admin.password;
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('reads, hides, restores, and deletes a social feed post through admin UI', async ({ page }) => {
    const author = await seedE2EUser({
      suffix: 'admin-post-author',
      role: 'musician',
      fullName: 'E2E Admin Post Author',
    });
    const post = await seedE2EFeedPost(author.id, 'admin-post-moderation');

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/posts');
    await expectVisible(page.getByTestId('admin-posts-page'));
    await page.getByTestId('admin-posts-search-input').fill(post.content);

    const postCard = page.getByTestId(`admin-post-card-${post.id}`);
    await expect(postCard).toBeVisible({ timeout: 45_000 });

    await page.getByTestId(`admin-post-hide-${post.id}`).click();
    await expectDbRecord<any>('feed_posts', 'id', post.id, (record) => record.is_hidden === true);
    await expect(page.getByTestId(`admin-post-hide-${post.id}`)).toBeVisible({ timeout: 45_000 });

    await page.getByTestId(`admin-post-hide-${post.id}`).click();
    await expectDbRecord<any>('feed_posts', 'id', post.id, (record) => record.is_hidden === false);
    await expect(postCard).toBeVisible({ timeout: 45_000 });

    await page.getByTestId(`admin-post-delete-${post.id}`).click();
    await expectNoDbRecord('feed_posts', 'id', post.id);
    await expect(postCard).toHaveCount(0, { timeout: 45_000 });
  });

  test('reads, suspends, and reactivates a marketplace product through admin UI', async ({ page }) => {
    const seller = await seedE2EUser({
      suffix: 'admin-product-seller',
      role: 'musician',
      fullName: 'E2E Admin Product Seller',
    });
    const product = await seedE2EProduct(seller.id, 'admin-product-moderation');

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/products');
    await expectVisible(page.getByTestId('admin-products-page'));
    await page.getByTestId('admin-products-search-input').fill(product.title);

    const productCard = page.getByTestId(`admin-product-card-${product.id}`);
    await expect(productCard).toBeVisible({ timeout: 45_000 });

    await page.getByTestId(`admin-product-suspend-${product.id}`).click();
    await expectDbRecord<any>('products', 'id', product.id, (record) => record.status === 'suspended');
    await expect(page.getByTestId(`admin-product-activate-${product.id}`)).toBeVisible({ timeout: 45_000 });

    await page.getByTestId(`admin-product-activate-${product.id}`).click();
    await expectDbRecord<any>('products', 'id', product.id, (record) => record.status === 'active');
    await expect(page.getByTestId(`admin-product-suspend-${product.id}`)).toBeVisible({ timeout: 45_000 });
  });
});
