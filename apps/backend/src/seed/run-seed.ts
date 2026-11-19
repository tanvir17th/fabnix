/**
 * Dev/pilot seed: permission catalog + plans, a Super Admin with all platform
 * permissions. Run: npm run db:seed (reads DATABASE_URL, SEED_ADMIN_EMAIL,
 * SEED_ADMIN_PASSWORD). Idempotent.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash, Algorithm } from '@node-rs/argon2';
import { ALL_PLATFORM_PERMISSIONS, ALL_SHOP_PERMISSIONS, SENSITIVE_PERMISSIONS, permissionLabelKey } from '@fabnix/shared';
import { PrismaClient } from '../generated/prisma/client';
import { DEFAULT_PLANS } from '../common/bootstrap/catalog-bootstrap.service';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@fabnix.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('SEED_ADMIN_PASSWORD (≥12 chars) is required');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await prisma.permission.createMany({
      data: [
        ...ALL_SHOP_PERMISSIONS.map((code) => ({ code, scope: 'SHOP' as const, labelKey: permissionLabelKey(code), isSensitive: SENSITIVE_PERMISSIONS.has(code) })),
        ...ALL_PLATFORM_PERMISSIONS.map((code) => ({ code, scope: 'PLATFORM' as const, labelKey: permissionLabelKey(code), isSensitive: true })),
      ],
      skipDuplicates: true,
    });
    await prisma.plan.createMany({ data: DEFAULT_PLANS.map((p) => ({ ...p })), skipDuplicates: true });

    const role = await prisma.adminRole.upsert({ where: { name: 'Platform Owner' }, create: { name: 'Platform Owner', description: 'All platform permissions' }, update: {} });
    await prisma.adminRolePermission.createMany({ data: ALL_PLATFORM_PERMISSIONS.map((permissionCode) => ({ roleId: role.id, permissionCode })), skipDuplicates: true });

    const passwordHash = await hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const admin = await prisma.user.upsert({
      where: { type_email: { type: 'SUPER_ADMIN', email } },
      create: { type: 'SUPER_ADMIN', fullName: 'FABNIX Admin', email, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date(), preferredLanguage: 'en' },
      update: {},
    });
    await prisma.adminUserRole.upsert({ where: { userId_roleId: { userId: admin.id, roleId: role.id } }, create: { userId: admin.id, roleId: role.id }, update: {} });
    console.log(`Seeded Super Admin ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
