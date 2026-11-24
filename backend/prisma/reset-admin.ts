/**
 * Erase existing Super Admin account(s) and create a fresh one with new credentials.
 *
 * Unlike the seed (whose upsert has `update: {}` and therefore never resets an
 * existing password), this script DELETES every SUPER_ADMIN user, then creates one
 * clean account. Run it against whichever database you want to affect by setting
 * DATABASE_URL (e.g. the production Atlas URL used by the Render backend).
 *
 * Usage:
 *   DATABASE_URL="<mongodb-url>" \
 *   ADMIN_EMAIL="admin@aicte.vimarsh.local" \
 *   ADMIN_PASSWORD="<new-password>" \
 *   npm run reset-admin
 */
import { PrismaClient, OrgType, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@aicte.vimarsh.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function main(): Promise<void> {
  if (!ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_PASSWORD in the environment before running reset-admin.');
  }

  // 1. Erase previous admin credential(s): remove every existing Super Admin.
  const deleted = await prisma.user.deleteMany({ where: { role: Role.SUPER_ADMIN } });
  console.log(`Erased ${deleted.count} existing SUPER_ADMIN account(s).`);

  // 2. Ensure the AICTE organization exists to attach the admin to.
  const aicte = await prisma.organization.upsert({
    where: { code: 'AICTE-HQ' },
    update: {},
    create: { name: 'All India Council for Technical Education', type: OrgType.AICTE, code: 'AICTE-HQ' },
  });

  // 3. Create the fresh Super Admin.
  const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      fullName: 'AICTE Super Admin',
      passwordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.APPROVED,
      emailVerified: true,
      orgId: aicte.id,
      designation: 'Platform Administrator',
    },
  });

  console.log('New Super Admin created:');
  console.log(`  id:       ${admin.id}`);
  console.log(`  email:    ${ADMIN_EMAIL}`);
  console.log(`  password: ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
