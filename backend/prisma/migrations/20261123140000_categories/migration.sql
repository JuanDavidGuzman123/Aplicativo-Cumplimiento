CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

INSERT INTO "Category" ("id", "key", "name", "active", "sortOrder", "createdAt")
VALUES
    ('11111111-1111-4111-8111-111111111111', 'ARRIENDOS', 'Arriendos', true, 1, CURRENT_TIMESTAMP),
    ('22222222-2222-4222-8222-222222222222', 'COLOCADORES_INDEPENDIENTES', 'Colocadores independientes', true, 2, CURRENT_TIMESTAMP);

ALTER TABLE "Counterparty" ADD COLUMN "categoryId" TEXT;

UPDATE "Counterparty"
SET "categoryId" = '11111111-1111-4111-8111-111111111111'
WHERE "categoryId" IS NULL;

ALTER TABLE "Counterparty" ALTER COLUMN "categoryId" SET NOT NULL;

CREATE INDEX "Counterparty_categoryId_idx" ON "Counterparty"("categoryId");

ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
