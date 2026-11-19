import { hash, Algorithm } from '@node-rs/argon2';
import sharp from 'sharp';
import { ALL_PLATFORM_PERMISSIONS } from '@fabnix/shared';
import { TestApp, uniq } from './test-app';

export interface Session {
  token: string;
  userId: string;
  email: string;
  password: string;
}

export interface ShopFixture extends Session {
  shopId: string;
  branchId: string;
  cashMethodId: string;
  codMethodId: string;
}

const PASSWORD = 'Fabnix-Test-Pass-1';

export async function register(t: TestApp, type: 'CUSTOMER' | 'SHOPKEEPER', name = 'Test User', email = `${uniq('u')}@example.com`): Promise<Session> {
  const r = await t.api.anon.post('/auth/register', { type, fullName: name, email, password: PASSWORD });
  if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.body)}`);
  return login(t, type, email);
}

export async function login(t: TestApp, type: 'CUSTOMER' | 'SHOPKEEPER' | 'SUPER_ADMIN', email: string, password = PASSWORD): Promise<Session> {
  const r = await t.api.anon.post('/auth/login', { type, identifier: email, password });
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.accessToken, userId: r.body.user.id, email, password };
}

export async function ownerWithShop(t: TestApp, name = 'ABC Fabrics'): Promise<ShopFixture> {
  const s = await register(t, 'SHOPKEEPER', `${name} Owner`);
  const shop = await t.api.as(s.token).post('/shops', { name, defaultLanguage: 'bn' });
  if (shop.status !== 201) throw new Error(`shop failed ${shop.status} ${JSON.stringify(shop.body)}`);
  const methods = await t.api.as(s.token).get(`/shops/${shop.body.id}/payment-methods`);
  return {
    ...s,
    shopId: shop.body.id,
    branchId: shop.body.branches[0].id,
    cashMethodId: methods.body.find((m: { type: string }) => m.type === 'CASH').id,
    codMethodId: methods.body.find((m: { type: string }) => m.type === 'CASH_ON_DELIVERY').id,
  };
}

export async function configureGira(t: TestApp, f: ShopFixture, inches = '2.25') {
  const r = await t.api.as(f.token).post(`/shops/${f.shopId}/units`, { code: 'GIRA', kind: 'GIRA', name: 'Gira', symbol: 'gira', inchesPerUnit: inches });
  if (r.status !== 201) throw new Error(`gira failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function product(t: TestApp, f: ShopFixture, overrides: Record<string, unknown> = {}) {
  const r = await t.api.as(f.token).post(`/shops/${f.shopId}/products`, { name: 'Cotton Lawn', sku: uniq('SKU'), sellingRate: '200', purchaseRate: '120', priceUnitCode: 'YARD', ...overrides });
  if (r.status !== 201) throw new Error(`product failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { id: string; slug: string; sku: string };
}

export async function openingStock(t: TestApp, f: ShopFixture, productId: string, measurement: unknown) {
  const r = await t.api.as(f.token).post(`/shops/${f.shopId}/inventory/opening`, { branchId: f.branchId, productId, measurement });
  if (r.status !== 201) throw new Error(`opening failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function stockOf(t: TestApp, f: ShopFixture, productId: string) {
  const row = await t.prisma.inventory.findFirstOrThrow({ where: { shopId: f.shopId, branchId: f.branchId, productId } });
  return { onHand: row.onHandInches.toFixed(4), reserved: row.reservedInches.toFixed(4) };
}

/** Storefront enabled + published with home delivery (৳60) and pickup (free). */
export async function publishStore(t: TestApp, f: ShopFixture, slug: string) {
  const a = t.api.as(f.token);
  const sf = await a.put(`/shops/${f.shopId}/storefront`, { slug, displayName: 'ABC Fabrics Online', stockVisibility: 'STATUS_ONLY' });
  if (sf.status !== 200) throw new Error(`storefront failed ${sf.status} ${JSON.stringify(sf.body)}`);
  const home = await a.post(`/shops/${f.shopId}/storefront/delivery-options`, { method: 'HOME_DELIVERY', name: 'Dhaka home delivery', flatFee: '60' });
  const pickup = await a.post(`/shops/${f.shopId}/storefront/delivery-options`, { method: 'PICKUP', name: 'Pick up at shop', flatFee: '0' });
  await a.post(`/shops/${f.shopId}/storefront/visibility`, { action: 'ENABLE' });
  const pub = await a.post(`/shops/${f.shopId}/storefront/visibility`, { action: 'PUBLISH' });
  if (pub.status !== 201) throw new Error(`publish failed ${pub.status} ${JSON.stringify(pub.body)}`);
  return { storefrontId: sf.body.id as string, homeId: home.body.id as string, pickupId: pickup.body.id as string };
}

export async function publishProduct(t: TestApp, f: ShopFixture, productId: string) {
  const r = await t.api.as(f.token).put(`/shops/${f.shopId}/products/${productId}/publication`, { published: true });
  if (r.status !== 200) throw new Error(`publish product failed ${r.status} ${JSON.stringify(r.body)}`);
}

export const checkoutBody = (deliveryOptionId: string, paymentMethodId: string, extra: Record<string, unknown> = {}) => ({
  deliveryOptionId,
  paymentMethodId,
  recipientName: 'Nusrat Jahan',
  recipientPhone: '01711223344',
  addressLine: 'House 12, Road 5, Dhanmondi',
  city: 'Dhaka',
  ...extra,
});

export async function superAdmin(t: TestApp): Promise<Session> {
  const email = `${uniq('admin')}@fabnix.local`;
  const password = 'Admin-Pass-123456';
  const user = await t.prisma.user.create({
    data: { type: 'SUPER_ADMIN', fullName: 'Platform Admin', email, status: 'ACTIVE', emailVerifiedAt: new Date(), passwordHash: await hash(password, { algorithm: Algorithm.Argon2id }) },
  });
  const role = await t.prisma.adminRole.create({ data: { name: uniq('role') } });
  await t.prisma.adminRolePermission.createMany({ data: ALL_PLATFORM_PERMISSIONS.map((permissionCode) => ({ roleId: role.id, permissionCode })) });
  await t.prisma.adminUserRole.create({ data: { userId: user.id, roleId: role.id } });
  return login(t, 'SUPER_ADMIN', email, password);
}

export function pngImage(width = 900, height = 900, color = { r: 200, g: 150, b: 84 }) {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

export function refreshCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  return cookies.find((c) => c.startsWith('fabnix_rt='))?.split(';')[0];
}
