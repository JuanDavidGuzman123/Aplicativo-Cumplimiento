-- CreateEnum
CREATE TYPE "AnnualStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "AnnualCounterparty" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeNormalized" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "status" "AnnualStatus" NOT NULL DEFAULT 'ACTIVE',
    "requiresSemiannualFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "lastAnnualUpdateDate" DATE,
    "sourceFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualCounterparty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnualCounterparty_codeNormalized_key" ON "AnnualCounterparty"("codeNormalized");

-- CreateIndex
CREATE INDEX "AnnualCounterparty_status_idx" ON "AnnualCounterparty"("status");

-- CreateIndex
CREATE INDEX "AnnualCounterparty_lastAnnualUpdateDate_idx" ON "AnnualCounterparty"("lastAnnualUpdateDate");

-- CreateIndex
CREATE INDEX "AnnualCounterparty_businessName_idx" ON "AnnualCounterparty"("businessName");

-- CreateIndex
CREATE INDEX "AnnualCounterparty_requiresSemiannualFollowUp_idx" ON "AnnualCounterparty"("requiresSemiannualFollowUp");
