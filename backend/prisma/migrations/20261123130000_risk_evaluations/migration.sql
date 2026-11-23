CREATE TYPE "RiskDecision" AS ENUM ('CONTINUE', 'ARCHIVE', 'REACTIVATE');

CREATE TABLE "RiskEvaluation" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "decision" "RiskDecision" NOT NULL,
    "evaluatedAt" DATE NOT NULL,
    "nextFollowUpDate" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RiskEvaluation_counterpartyId_decision_evaluatedAt_key" ON "RiskEvaluation"("counterpartyId", "decision", "evaluatedAt");

CREATE INDEX "RiskEvaluation_counterpartyId_evaluatedAt_idx" ON "RiskEvaluation"("counterpartyId", "evaluatedAt");

ALTER TABLE "RiskEvaluation" ADD CONSTRAINT "RiskEvaluation_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RiskEvaluation" ADD CONSTRAINT "RiskEvaluation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
