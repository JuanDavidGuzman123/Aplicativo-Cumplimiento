-- CreateEnum
CREATE TYPE "AnnualNotificationType" AS ENUM ('ANNUAL_D15', 'ANNUAL_D10', 'ANNUAL_D5');

-- CreateTable
CREATE TABLE "AnnualNotification" (
    "id" TEXT NOT NULL,
    "annualCounterpartyId" TEXT NOT NULL,
    "type" "AnnualNotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnualNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualNotificationRead" (
    "annualNotificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnualNotificationRead_pkey" PRIMARY KEY ("annualNotificationId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnualNotification_annualCounterpartyId_type_scheduledDate_key" ON "AnnualNotification"("annualCounterpartyId", "type", "scheduledDate");

-- CreateIndex
CREATE INDEX "AnnualNotification_scheduledDate_idx" ON "AnnualNotification"("scheduledDate");

-- CreateIndex
CREATE INDEX "AnnualNotificationRead_userId_idx" ON "AnnualNotificationRead"("userId");

-- AddForeignKey
ALTER TABLE "AnnualNotification" ADD CONSTRAINT "AnnualNotification_annualCounterpartyId_fkey" FOREIGN KEY ("annualCounterpartyId") REFERENCES "AnnualCounterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualNotificationRead" ADD CONSTRAINT "AnnualNotificationRead_annualNotificationId_fkey" FOREIGN KEY ("annualNotificationId") REFERENCES "AnnualNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualNotificationRead" ADD CONSTRAINT "AnnualNotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
