-- JV numbering + subsidiary-friendly audit trail
CREATE TABLE "JournalSequence" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalSequence_pkey" PRIMARY KEY ("year")
);

ALTER TABLE "Transaction" ADD COLUMN "jvNumber" TEXT;

CREATE UNIQUE INDEX "Transaction_jvNumber_key" ON "Transaction"("jvNumber");

-- Backfill JV numbers by transaction year (creation order)
WITH numbered AS (
    SELECT
        id,
        EXTRACT(YEAR FROM "transactionDate")::INTEGER AS yr,
        ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM "transactionDate")
            ORDER BY "createdAt" ASC
        ) AS rn
    FROM "Transaction"
)
UPDATE "Transaction" AS t
SET "jvNumber" = 'JV-' || n.yr::TEXT || '-' || LPAD(n.rn::TEXT, 5, '0')
FROM numbered AS n
WHERE t.id = n.id AND t."jvNumber" IS NULL;

-- Seed sequence counters from backfilled maxima
INSERT INTO "JournalSequence" ("year", "nextNumber", "updatedAt")
SELECT
    EXTRACT(YEAR FROM "transactionDate")::INTEGER AS yr,
    MAX(
        CAST(SUBSTRING("jvNumber" FROM 'JV-[0-9]+-([0-9]+)$') AS INTEGER)
    ) AS max_num,
    CURRENT_TIMESTAMP
FROM "Transaction"
WHERE "jvNumber" IS NOT NULL
GROUP BY EXTRACT(YEAR FROM "transactionDate")::INTEGER
ON CONFLICT ("year") DO UPDATE
SET "nextNumber" = GREATEST("JournalSequence"."nextNumber", EXCLUDED."nextNumber"),
    "updatedAt" = CURRENT_TIMESTAMP;
