-- The follow-up column is tri-state: true (Sí), false (No) or null (sin dato).
ALTER TABLE "AnnualCounterparty"
ALTER COLUMN "requiresSemiannualFollowUp" DROP DEFAULT,
ALTER COLUMN "requiresSemiannualFollowUp" DROP NOT NULL;

-- Previous imports converted blank cells to false. Reimport the source file
-- after this migration to restore explicitly marked "No" values.
UPDATE "AnnualCounterparty"
SET "requiresSemiannualFollowUp" = NULL
WHERE "requiresSemiannualFollowUp" = false;
