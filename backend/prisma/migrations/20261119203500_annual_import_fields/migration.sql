-- Rename filing date and add the remaining fields from the annual base
ALTER TABLE "AnnualCounterparty"
RENAME COLUMN "lastAnnualUpdateDate" TO "filingDate";

ALTER TABLE "AnnualCounterparty"
ADD COLUMN "filingYear" INTEGER,
ADD COLUMN "dueDiligenceType" TEXT,
ADD COLUMN "observations" TEXT;

DROP INDEX IF EXISTS "AnnualCounterparty_lastAnnualUpdateDate_idx";

CREATE INDEX "AnnualCounterparty_filingDate_idx"
ON "AnnualCounterparty"("filingDate");

CREATE INDEX "AnnualCounterparty_filingYear_idx"
ON "AnnualCounterparty"("filingYear");
