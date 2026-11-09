/**
 * Seed baseline data so the platform is usable and testable:
 *  - one AICTE (SUPER_ADMIN) organization + a bootstrap Super Admin account
 *  - one sample Institute with a department
 * Idempotent: safe to run repeatedly. Credentials are for LOCAL DEV ONLY.
 */
import { PrismaClient, OrgType, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Credentials come from the environment (.env). Dev defaults are provided so a fresh
// checkout is usable immediately, but any real deployment MUST set these in .env.
const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@aicte.vimarsh.local';
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin@12345';

if (process.env.NODE_ENV === 'production' && !process.env.SEED_SUPER_ADMIN_PASSWORD) {
  throw new Error('Refusing to seed in production without SEED_SUPER_ADMIN_PASSWORD set in .env');
}

async function main(): Promise<void> {
  // AICTE org
  const aicte = await prisma.organization.upsert({
    where: { code: 'AICTE-HQ' },
    update: {},
    create: { name: 'All India Council for Technical Education', type: OrgType.AICTE, code: 'AICTE-HQ' },
  });

  // Sample institute + department
  const institute = await prisma.organization.upsert({
    where: { code: 'IITD' },
    update: {},
    create: { name: 'Indian Institute of Technology Delhi', type: OrgType.INSTITUTE, code: 'IITD' },
  });
  const existingDept = await prisma.department.findFirst({ where: { orgId: institute.id, name: 'Computer Science & Engineering' } });
  const dept = existingDept ?? (await prisma.department.create({ data: { orgId: institute.id, name: 'Computer Science & Engineering' } }));

  // Bootstrap Super Admin
  const passwordHash = await argon2.hash(SUPER_ADMIN_PASSWORD, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {},
    create: {
      email: SUPER_ADMIN_EMAIL,
      fullName: 'AICTE Super Admin',
      passwordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.APPROVED,
      emailVerified: true,
      orgId: aicte.id,
      designation: 'Platform Administrator',
    },
  });

  console.log('Seed complete:');
  console.log(`  AICTE org id:      ${aicte.id} (code AICTE-HQ)`);
  console.log(`  Institute org id:  ${institute.id} (code IITD)`);
  console.log(`  Department id:     ${dept.id} (CSE)`);
  console.log(`  Super Admin:       ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}  [DEV ONLY]`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
