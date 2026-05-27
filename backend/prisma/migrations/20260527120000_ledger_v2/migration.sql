-- Ledger v2: hierarchical Account, Transaction + line JournalEntry, FiscalPeriod

-- Drop MVP ledger tables (JournalLine → old header JournalEntry → ChartAccount)
DROP TABLE IF EXISTS "JournalLine" CASCADE;
DROP TABLE IF EXISTS "JournalEntry" CASCADE;
DROP TABLE IF EXISTS "ChartAccount" CASCADE;

-- Extend account types for CDA
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'COST_OF_GOODS';

-- Transaction workflow status
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'VOID');

-- Chart of accounts (hierarchical)
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "isContra" BOOLEAN NOT NULL DEFAULT false,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");
CREATE INDEX "Account_type_idx" ON "Account"("type");
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fiscal periods
CREATE TABLE "FiscalPeriod" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "FiscalPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalPeriod_year_month_key" ON "FiscalPeriod"("year", "month");

-- Voucher header
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "postedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "source" TEXT,
    "participantId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "amount" DECIMAL(18,2),
    "memo" TEXT,
    "metadata" JSONB,
    "fiscalPeriodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_participantId_idx" ON "Transaction"("participantId");
CREATE INDEX "Transaction_fiscalPeriodId_idx" ON "Transaction"("fiscalPeriodId");
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");
CREATE INDEX "Transaction_source_idx" ON "Transaction"("source");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "FiscalPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integration idempotency
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationEvent_externalId_key" ON "IntegrationEvent"("externalId");
CREATE UNIQUE INDEX "IntegrationEvent_transactionId_key" ON "IntegrationEvent"("transactionId");
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Double-entry lines
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "memberId" TEXT,
    "vendorId" TEXT,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalEntry_transactionId_idx" ON "JournalEntry"("transactionId");
CREATE INDEX "JournalEntry_accountId_idx" ON "JournalEntry"("accountId");
CREATE INDEX "JournalEntry_memberId_idx" ON "JournalEntry"("memberId");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Surplus allocation (Phase 3)
CREATE TABLE "AllocationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "AllocationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllocationTemplate_name_key" ON "AllocationTemplate"("name");

CREATE TABLE "AllocationRule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "percentage" DECIMAL(5,4) NOT NULL,
    "category" TEXT,
    CONSTRAINT "AllocationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AllocationRule_templateId_idx" ON "AllocationRule"("templateId");
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AllocationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
