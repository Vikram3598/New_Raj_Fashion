CREATE TABLE "StoreVisitVerification" (
    "id" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreVisitVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreVisitVerification_contact_createdAt_idx" ON "StoreVisitVerification"("contact", "createdAt");
CREATE INDEX "StoreVisitVerification_expiresAt_idx" ON "StoreVisitVerification"("expiresAt");
