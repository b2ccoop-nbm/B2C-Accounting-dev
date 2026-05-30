/**
 * Add accounting staff: node scripts/add-staff.js treasurer@example.com TREASURER
 */
const { PrismaClient, StaffRole } = require("@prisma/client");

const email = String(process.argv[2] ?? "").trim().toLowerCase();
const roleArg = String(process.argv[3] ?? "TREASURER").toUpperCase();

if (!email) {
  console.error(
    "Usage: node scripts/add-staff.js <email> [SUPERUSER|ADMIN|TREASURER|ACCOUNTANT|GENERAL_MANAGER|CHAIRMAN]",
  );
  process.exit(1);
}

if (!StaffRole[roleArg]) {
  console.error(`Invalid role: ${roleArg}`);
  process.exit(1);
}

const prisma = new PrismaClient();

prisma.staffUser
  .upsert({
    where: { email },
    create: { email, role: StaffRole[roleArg] },
    update: { role: StaffRole[roleArg] },
  })
  .then((row) => {
    console.log(`StaffUser ${row.email} (${row.role}) id=${row.id}`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
