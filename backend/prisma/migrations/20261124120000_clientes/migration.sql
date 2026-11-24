INSERT INTO "Category" ("id", "key", "name", "active", "sortOrder", "createdAt")
VALUES
    ('33333333-3333-4333-8333-333333333333', 'CLIENTES', 'Clientes', true, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "AnnualCounterparty" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'arriendos';

DROP INDEX IF EXISTS "AnnualCounterparty_codeNormalized_key";

CREATE UNIQUE INDEX "AnnualCounterparty_source_codeNormalized_key" ON "AnnualCounterparty"("source", "codeNormalized");

CREATE INDEX "AnnualCounterparty_source_idx" ON "AnnualCounterparty"("source");
