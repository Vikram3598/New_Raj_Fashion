ALTER TABLE "StoreSettings" ADD COLUMN "pickupReminderMinutes" INTEGER[] NOT NULL DEFAULT ARRAY[1440, 120];

CREATE TABLE "PickupReminder" (
    "id" TEXT NOT NULL,
    "fulfilmentId" TEXT NOT NULL,
    "reminderMinutes" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PickupReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PickupReminder_idempotencyKey_key" ON "PickupReminder"("idempotencyKey");
CREATE INDEX "PickupReminder_status_dueAt_idx" ON "PickupReminder"("status", "dueAt");
CREATE INDEX "PickupReminder_fulfilmentId_idx" ON "PickupReminder"("fulfilmentId");
ALTER TABLE "PickupReminder" ADD CONSTRAINT "PickupReminder_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "OrderFulfilment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
