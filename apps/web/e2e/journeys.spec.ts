import { Browser, BrowserContext, Page, expect, test } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';
import bn from '../messages/bn.json';
import en from '../messages/en.json';
import { ADMIN } from './stack';

/**
 * Real-browser journeys across all three user types (§A7), in Bangla first.
 * Labels are taken from the same catalogs the UI renders.
 */

/** Minimal solid-colour PNG (fabric swatch) — no image dependency needed. */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const stamp = Date.now().toString(36);
const owner = { name: 'রহিম উদ্দিন', email: `owner-${stamp}@example.com`, password: 'Owner-Pass-123' };
const buyer = { name: 'নুসরাত জাহান', email: `buyer-${stamp}@example.com`, password: 'Buyer-Pass-123' };
const slug = `abc-fabrics-${stamp}`;
let shopId = '';
/** SCREENSHOTS=<dir> captures key screens for visual review (not asserted). */
const shot = async (p: Page, name: string) => {
  if (process.env.SCREENSHOTS) await p.screenshot({ path: `${process.env.SCREENSHOTS}/${name}.png`, fullPage: true });
};

test.describe.configure({ mode: 'serial' });

let ownerCtx: BrowserContext;
let ownerPage: Page;
let buyerCtx: BrowserContext;
let buyerPage: Page;

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'bn-BD', timezoneId: 'Asia/Dhaka' });
  return { ctx, page: await ctx.newPage() };
}

test.beforeAll(async ({ browser }) => {
  ({ ctx: ownerCtx, page: ownerPage } = await newPage(browser));
  ({ ctx: buyerCtx, page: buyerPage } = await newPage(browser));
});
test.afterAll(async () => {
  await ownerCtx.close();
  await buyerCtx.close();
});

test('home renders in Bangla by default with the FABNIX brand', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/bn$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(bn.home.headline);
  await expect(page.getByRole('button', { name: 'বাংলা' })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, '01-home');
});

test('shopkeeper onboards: account → shop → Gira 2.25″ → fabric with photo and stock', async () => {
  const p = ownerPage;
  await p.goto('/bn/register?portal=business');
  await p.getByLabel(bn.auth.fullName).fill(owner.name);
  await p.getByLabel(bn.auth.identifier).fill(owner.email);
  await p.getByLabel(bn.auth.password).fill(owner.password);
  await p.getByRole('button', { name: bn.auth.createAccount }).click();
  await expect(p).toHaveURL(/\/bn\/business$/);

  await p.getByLabel(bn.business.shopName).fill('এবিসি ফেব্রিক্স');
  await p.getByRole('button', { name: bn.business.createShop }).click();
  await expect(p).toHaveURL(/\/business\/[0-9a-f-]{36}\/settings\?onboarding=1/);
  shopId = p.url().match(/business\/([0-9a-f-]{36})/)![1]!;

  // FR-013: Gira is not assumed — the owner confirms it.
  await expect(p.getByText(bn.settings.units.giraRequired)).toBeVisible();
  await p.getByRole('button', { name: '2.25″' }).click();
  await expect(p.getByText(/= ৫ গজ ৪ গিরা|= 5 গজ 4 গিরা/)).toBeVisible();
  await p.getByRole('button', { name: bn.settings.units.confirmGira }).click();
  await expect(p.getByText(/সংস্করণ 1|সংস্করণ ১/)).toBeVisible();

  // Product (Bangla name kept as entered — NFR-L10N-007)
  await p.goto(`/bn/business/${shopId}/products`);
  await p.getByRole('button', { name: bn.products.new }).click();
  const dialog = p.getByRole('dialog');
  await dialog.getByLabel(bn.products.name).fill('সুতি লন');
  await dialog.getByLabel(bn.products.sku).fill('CL-001');
  await dialog.getByLabel(bn.products.price).fill('200');
  await dialog.getByRole('button', { name: bn.common.create }).click();
  await expect(p).toHaveURL(/\/products\/[0-9a-f-]{36}$/);

  // FR-091/092 photos (validated + re-encoded server-side)
  await p.locator('#photo-upload').setInputFiles([
    { name: 'indigo.png', mimeType: 'image/png', buffer: png(900, 900, [30, 58, 138]) },
    { name: 'ochre.png', mimeType: 'image/png', buffer: png(900, 900, [200, 150, 84]) },
  ]);
  await expect(p.getByRole('img').filter({ has: p.locator('[src$="thumb.webp"]') }).or(p.locator('img[src$="thumb.webp"]'))).toHaveCount(2);
  await p.getByRole('button', { name: bn.products.publish }).click();
  await expect(p.getByRole('button', { name: bn.products.unpublish })).toBeVisible();

  // FR-026 opening stock: 20 yards
  await p.goto(`/bn/business/${shopId}/inventory`);
  await p.getByRole('button', { name: bn.inventory.opening }).click();
  await p.getByRole('dialog').getByLabel(bn.measure.quick).fill('২০ গজ');
  await p.getByRole('dialog').getByRole('button', { name: bn.common.save }).click();
  await expect(p.getByRole('cell', { name: /২০.*গজ|20.*গজ/ }).first()).toBeVisible();
});

test('POS: “৫ গজ ৪ গিরা” at ৳200/yd totals ৳1,050 (AC-006); invoice language is independent (NFR-L10N-006)', async () => {
  const p = ownerPage;
  await p.goto(`/bn/business/${shopId}/pos`);
  await p.getByLabel(bn.pos.searchProduct).fill('CL-001');
  await p.getByRole('button', { name: /সুতি লন/ }).click();
  await p.getByLabel(bn.measure.quick).fill('৫ গজ ৪ গিরা');
  await expect(p.getByTestId('pos-total')).toContainText('১,০৫০.০০');
  await expect(p.getByText('১৮৯ ইঞ্চি').first()).toBeVisible(); // normalized length (FR-018)
  await shot(p, '03-pos');
  await p.getByRole('button', { name: bn.pos.payFull }).click();
  await p.getByRole('button', { name: bn.pos.complete }).click();
  await expect(p.getByText(/বিক্রি INV-\d{4}-000001 সম্পন্ন/)).toBeVisible();
  await p.getByRole('link', { name: bn.pos.viewInvoice }).click();

  await expect(p.locator('article[lang="bn"]')).toContainText(bn.invoiceDoc.title);
  await expect(p.locator('article[lang="bn"]')).toContainText('১,০৫০.০০');
  await p.getByLabel(bn.sales.invoiceLanguage).selectOption('en');
  await expect(p.locator('article[lang="en"]')).toContainText(en.invoiceDoc.title);
  await expect(p.locator('article[lang="en"]')).toContainText('1,050.00');
  await shot(p, '04-invoice-en');
  // the workspace UI stays Bangla
  await expect(p.getByRole('button', { name: bn.sales.print })).toBeVisible();
});

test('shopkeeper publishes the storefront with home delivery', async () => {
  const p = ownerPage;
  await p.goto(`/bn/business/${shopId}/online-store`);
  await p.getByLabel(bn.store.admin.field.slug).fill(slug);
  await p.getByLabel(bn.store.admin.field.displayName).fill('এবিসি ফেব্রিক্স অনলাইন');
  await p.getByRole('button', { name: bn.store.admin.create }).click();
  await expect(p.getByText(`fabnix.com/shop/${slug}`)).toBeVisible();
  await p.getByPlaceholder(bn.store.admin.optionName).fill('ঢাকার ভেতরে');
  await p.getByLabel(bn.store.admin.fee).fill('60');
  await p.getByRole('button', { name: `+ ${bn.store.admin.addOption}` }).click();
  await expect(p.getByRole('cell', { name: /ঢাকার ভেতরে/ })).toBeVisible();
  await p.getByRole('button', { name: bn.store.admin.enable, exact: true }).first().click();
  await p.getByRole('button', { name: bn.store.admin.publish }).click();
  await expect(p.getByText(bn.status.PUBLISHED)).toBeVisible();
});

test('customer: browse → Gira calculator → cart → checkout (AC-017…AC-020)', async () => {
  const p = buyerPage;
  await p.goto('/bn');
  await p.getByRole('link', { name: /এবিসি ফেব্রিক্স অনলাইন/ }).click();
  await expect(p).toHaveURL(new RegExp(`/bn/shop/${slug}$`));
  await p.getByRole('link', { name: /সুতি লন/ }).click();
  await expect(p.getByRole('heading', { name: 'সুতি লন' })).toBeVisible();

  await p.getByLabel('গজ', { exact: true }).fill('5');
  await p.getByLabel('গিরা', { exact: true }).fill('4');
  await expect(p.getByTestId('quote-total')).toContainText('১,০৫০.০০');

  // Not signed in → sent to customer login, then back.
  await p.getByRole('button', { name: bn.product.addToCart }).click();
  await expect(p).toHaveURL(/\/bn\/login\?portal=customer/);
  await p.goto('/bn/register?portal=customer');
  await p.getByLabel(bn.auth.fullName).fill(buyer.name);
  await p.getByLabel(bn.auth.identifier).fill(buyer.email);
  await p.getByLabel(bn.auth.password).fill(buyer.password);
  await p.getByRole('button', { name: bn.auth.createAccount }).click();
  await expect(p).toHaveURL(/\/bn$/);

  await p.goto(`/bn/shop/${slug}`);
  await p.getByRole('link', { name: /সুতি লন/ }).click();
  await p.getByLabel('গজ', { exact: true }).fill('5');
  await p.getByLabel('গিরা', { exact: true }).fill('4');
  await expect(p.getByTestId('quote-total')).toContainText('১,০৫০.০০');
  await shot(p, '05-product-calculator');
  await p.getByRole('button', { name: bn.product.addToCart }).click();
  await p.getByRole('link', { name: bn.product.goToCart }).click();
  await expect(p.getByText('৫ গজ ৪ গিরা').or(p.getByText('5 gira')).or(p.getByText(/5 yd 4 gira/))).toBeVisible();
  await p.getByRole('button', { name: bn.cart.checkout }).click();

  await p.getByLabel(bn.checkout.phone).fill('01711223344');
  await p.getByLabel(bn.checkout.address).fill('বাড়ি ১২, রোড ৫, ধানমন্ডি');
  await expect(p.getByTestId('checkout-total')).toContainText('১,১১০.০০'); // 1,050 + 60 delivery
  await shot(p, '06-checkout');
  await p.getByRole('button', { name: bn.checkout.place }).click();
  await expect(p).toHaveURL(/\/bn\/account\/orders\/[0-9a-f-]{36}\?placed=1/);
  await expect(p.getByText(/ORD-\d{4}-000001/).first()).toBeVisible();
  await expect(p.getByText(bn.status.PENDING_CONFIRMATION).first()).toBeVisible();
});

test('shopkeeper confirms; customer sees the timeline update (AC-021/AC-022)', async () => {
  const p = ownerPage;
  await p.goto(`/bn/business/${shopId}/orders`);
  await p.getByRole('link', { name: /ORD-\d{4}-000001/ }).click();
  await p.getByRole('button', { name: bn.orders.confirm }).click();
  await expect(p.getByText(/ইনভয়েস INV-\d{4}-000002/)).toBeVisible();
  await shot(p, '07-order-confirmed');

  await buyerPage.reload();
  await expect(buyerPage.getByRole('list', { name: bn.account.tracking }).getByText(bn.status.CONFIRMED, { exact: true })).toBeVisible();
});

test('AC-001: switching to English is instant and follows the user to a new session', async ({ browser }) => {
  const p = buyerPage;
  await p.getByRole('button', { name: 'English' }).click();
  await expect(p).toHaveURL(/\/en\/account\/orders\//);
  await expect(p.getByText(en.account.tracking)).toBeVisible();
  await expect(p.locator('html')).toHaveAttribute('lang', 'en');

  const { ctx, page } = await newPage(browser);
  await page.goto('/bn/login?portal=customer');
  await page.getByLabel(bn.auth.identifier).fill(buyer.email);
  await page.getByLabel(bn.auth.password).fill(buyer.password);
  await page.getByRole('button', { name: bn.auth.login, exact: true }).click();
  await expect(page).toHaveURL(/\/en$/); // preferred language restored (NFR-L10N-002)
  await ctx.close();
});

test('Super Admin suspends the storefront with a reason; it disappears and is audited (AC-028/AC-029)', async ({ browser }) => {
  const { ctx, page: p } = await newPage(browser);
  await p.goto('/bn/login?portal=admin');
  await p.getByLabel(bn.auth.identifier).fill(ADMIN.email);
  await p.getByLabel(bn.auth.password).fill(ADMIN.password);
  await p.getByRole('button', { name: bn.auth.login, exact: true }).click();
  // The seeded admin's saved language is English → the console opens in English (BR-013).
  await expect(p).toHaveURL(/\/en\/admin$/);
  await expect(p.getByText(en.admin.dashboard.storefronts)).toBeVisible();

  await p.goto('/en/admin/shops');
  const row = p.getByRole('row', { name: /এবিসি ফেব্রিক্স/ });
  await row.getByRole('button', { name: en.admin.shops.suspendStore }).click();
  await p.getByRole('dialog').getByLabel(en.common.reason).fill('ভুয়া পণ্যের অভিযোগ যাচাই');
  await p.getByRole('dialog').getByRole('button', { name: en.common.confirm }).click();
  await expect(row.getByRole('button', { name: en.admin.shops.reinstateStore })).toBeVisible();

  const anon = await browser.newPage();
  await anon.goto(`/bn/shop/${slug}`);
  await expect(anon.getByText(bn.store.notFound)).toBeVisible();
  await anon.close();

  await p.goto('/en/admin/audit');
  await expect(p.getByRole('cell', { name: /ভুয়া পণ্যের অভিযোগ যাচাই/ })).toBeVisible();
  await expect(p.getByText(en.auditActions.storefront.suspend)).toBeVisible();
  await shot(p, '08-admin-audit');
  await ctx.close();
});

test('cashier-facing pages need login; unauthenticated users are redirected', async ({ page }) => {
  await page.goto(`/bn/business/${shopId}/pos`);
  await expect(page).toHaveURL(/\/bn\/login\?portal=business/);
});
