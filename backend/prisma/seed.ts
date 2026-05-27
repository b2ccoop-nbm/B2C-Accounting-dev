import { AccountType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CoaRow = {
  code: string;
  title: string;
  type: AccountType;
  parentCode?: string;
  isStatutory?: boolean;
};

const COA: CoaRow[] = [
  { code: "10000", title: "ASSETS", type: AccountType.ASSET },
  { code: "11000", title: "CURRENT ASSETS", type: AccountType.ASSET, parentCode: "10000" },
  { code: "11100", title: "Cash and Cash Equivalents", type: AccountType.ASSET, parentCode: "11000" },
  { code: "11110", title: "Cash on Hand", type: AccountType.ASSET, parentCode: "11100" },
  { code: "11130", title: "Cash in Bank", type: AccountType.ASSET, parentCode: "11100" },
  { code: "11210", title: "Loans Receivable - Current", type: AccountType.ASSET, parentCode: "11000" },
  { code: "20000", title: "LIABILITIES", type: AccountType.LIABILITY },
  { code: "21110", title: "Savings Deposits", type: AccountType.LIABILITY, parentCode: "20000" },
  { code: "21210", title: "Accounts Payable - Trade", type: AccountType.LIABILITY, parentCode: "20000" },
  { code: "30000", title: "EQUITY", type: AccountType.EQUITY },
  { code: "30130", title: "Paid-up Share Capital - Common", type: AccountType.EQUITY, parentCode: "30000" },
  { code: "30710", title: "Reserve Fund", type: AccountType.EQUITY, parentCode: "30000", isStatutory: true },
  { code: "30720", title: "Coop. Education & Training Fund", type: AccountType.EQUITY, parentCode: "30000", isStatutory: true },
  { code: "40000", title: "REVENUE", type: AccountType.REVENUE },
  { code: "40310", title: "Sales", type: AccountType.REVENUE, parentCode: "40000" },
  { code: "40420", title: "Membership Fee", type: AccountType.REVENUE, parentCode: "40000" },
];

export async function seedCdaCoa() {
  console.log("Seeding CDA chart of accounts…");
  for (const row of COA) {
    const { parentCode, isStatutory, ...data } = row;
    let parentId: string | null = null;
    if (parentCode) {
      const parent = await prisma.account.findUnique({ where: { code: parentCode } });
      parentId = parent?.id ?? null;
    }
    await prisma.account.upsert({
      where: { code: data.code },
      update: {
        title: data.title,
        type: data.type,
        parentId,
        isStatutory: isStatutory ?? false,
        isActive: true,
      },
      create: {
        ...data,
        parentId,
        isStatutory: isStatutory ?? false,
      },
    });
  }
}

async function main() {
  await seedCdaCoa();

  const year = new Date().getFullYear();
  await prisma.fiscalPeriod.upsert({
    where: { year_month: { year, month: 0 } },
    create: {
      year,
      month: 0,
      startDate: new Date(`${year}-01-01T00:00:00.000Z`),
      endDate: new Date(`${year}-12-31T23:59:59.999Z`),
      isClosed: false,
    },
    update: { isClosed: false },
  });

  await prisma.sourcePostingRule.upsert({
    where: { source: "membership.initial_fees" },
    create: {
      source: "membership.initial_fees",
      debitCode: "11110",
      creditCode: "30130",
      description: "Share + membership fee received (Treasurer confirmation)",
    },
    update: {
      debitCode: "11110",
      creditCode: "30130",
      description: "Share + membership fee received (Treasurer confirmation)",
    },
  });

  await prisma.staffUser.upsert({
    where: { email: "nmatunog@gmail.com" },
    create: { email: "nmatunog@gmail.com", role: "SUPERUSER" },
    update: { role: "SUPERUSER" },
  });

  const demoVendor = await prisma.vendor.upsert({
    where: { code: "B2C-DEMO" },
    create: {
      code: "B2C-DEMO",
      name: "B2C Demo Vendor",
      email: "vendor-demo@b2ccoop.com",
    },
    update: { name: "B2C Demo Vendor", isActive: true },
  });

  await prisma.product.upsert({
    where: { vendorId_sku: { vendorId: demoVendor.id, sku: "RICE-5KG" } },
    create: {
      vendorId: demoVendor.id,
      sku: "RICE-5KG",
      name: "Premium Rice 5kg",
      unitPrice: 350,
    },
    update: { name: "Premium Rice 5kg", unitPrice: 350, isActive: true },
  });

  await prisma.product.upsert({
    where: { vendorId_sku: { vendorId: demoVendor.id, sku: "OIL-1L" } },
    create: {
      vendorId: demoVendor.id,
      sku: "OIL-1L",
      name: "Cooking Oil 1L",
      unitPrice: 120,
    },
    update: { name: "Cooking Oil 1L", unitPrice: 120, isActive: true },
  });

  console.log("Seed completed (COA, fiscal period, posting rules, staff, demo vendor).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
