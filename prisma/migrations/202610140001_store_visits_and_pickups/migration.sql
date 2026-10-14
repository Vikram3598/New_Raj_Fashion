-- Bilingual catalogue fields and durable in-store customer workflows.
CREATE TYPE "AppointmentSlotKind" AS ENUM ('VISIT', 'PICKUP');
CREATE TYPE "StoreVisitStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'MISSED');
CREATE TYPE "FulfilmentType" AS ENUM ('DELIVERY', 'STORE_PICKUP');
CREATE TYPE "PickupStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SCHEDULED', 'ARRIVED', 'PICKED_UP', 'CANCELLED', 'REFUND_PROCESSING', 'REFUNDED');
ALTER TYPE "PaymentMethod" ADD VALUE 'CASH_ON_PICKUP';

ALTER TABLE "Product" ADD COLUMN "nameHi" TEXT;
ALTER TABLE "Product" ADD COLUMN "descriptionHi" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "visitCapacity" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "StoreSettings" ADD COLUMN "pickupCapacity" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "StoreSettings" ADD COLUMN "allowCashOnPickup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSettings" ADD COLUMN "visitReminderMinutes" INTEGER[] NOT NULL DEFAULT ARRAY[1440, 120, 30];
ALTER TABLE "StoreSettings" ADD COLUMN "appointmentOpenMinute" INTEGER NOT NULL DEFAULT 600;
ALTER TABLE "StoreSettings" ADD COLUMN "appointmentCloseMinute" INTEGER NOT NULL DEFAULT 1200;

CREATE TABLE "AppointmentSlot" (
    "id" TEXT NOT NULL,
    "kind" "AppointmentSlotKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reservedCount" INTEGER NOT NULL DEFAULT 0,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppointmentSlot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppointmentSlot_kind_startsAt_key" ON "AppointmentSlot"("kind", "startsAt");
CREATE INDEX "AppointmentSlot_kind_startsAt_closed_idx" ON "AppointmentSlot"("kind", "startsAt", "closed");

CREATE TABLE "StoreVisit" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT,
    "slotId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "preferredContact" TEXT NOT NULL DEFAULT 'PHONE',
    "existingCustomerId" TEXT,
    "customerType" TEXT,
    "peopleCount" INTEGER,
    "durationMinutes" INTEGER,
    "purpose" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "totalBudgetPaise" INTEGER,
    "itemBudgetPaise" INTEGER,
    "familyMembers" INTEGER,
    "preferredBrands" TEXT,
    "clothingType" TEXT,
    "stitchingRequired" BOOLEAN NOT NULL DEFAULT false,
    "preferences" TEXT,
    "referenceImageUrl" TEXT,
    "status" "StoreVisitStatus" NOT NULL DEFAULT 'PENDING',
    "assignedStaffId" TEXT,
    "internalNotes" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreVisit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreVisit_reference_key" ON "StoreVisit"("reference");
CREATE INDEX "StoreVisit_userId_createdAt_idx" ON "StoreVisit"("userId", "createdAt");
CREATE INDEX "StoreVisit_assignedStaffId_slotId_idx" ON "StoreVisit"("assignedStaffId", "slotId");
CREATE INDEX "StoreVisit_status_createdAt_idx" ON "StoreVisit"("status", "createdAt");
ALTER TABLE "StoreVisit" ADD CONSTRAINT "StoreVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreVisit" ADD CONSTRAINT "StoreVisit_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreVisit" ADD CONSTRAINT "StoreVisit_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AppointmentSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StoreVisitItem" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "imageUrl" TEXT,
    "size" TEXT,
    "colour" TEXT,
    "material" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "budgetPaise" INTEGER,
    "instructions" TEXT,
    CONSTRAINT "StoreVisitItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreVisitItem_visitId_idx" ON "StoreVisitItem"("visitId");
ALTER TABLE "StoreVisitItem" ADD CONSTRAINT "StoreVisitItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "StoreVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreVisitItem" ADD CONSTRAINT "StoreVisitItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreVisitItem" ADD CONSTRAINT "StoreVisitItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VisitPreparationTask" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "assignedStaffId" TEXT,
    "internalNote" TEXT,
    "alternative" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VisitPreparationTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VisitPreparationTask_visitId_key_key" ON "VisitPreparationTask"("visitId", "key");
ALTER TABLE "VisitPreparationTask" ADD CONSTRAINT "VisitPreparationTask_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "StoreVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitPreparationTask" ADD CONSTRAINT "VisitPreparationTask_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VisitStatusHistory" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "fromStatus" "StoreVisitStatus",
    "toStatus" "StoreVisitStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VisitStatusHistory_visitId_createdAt_idx" ON "VisitStatusHistory"("visitId", "createdAt");
ALTER TABLE "VisitStatusHistory" ADD CONSTRAINT "VisitStatusHistory_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "StoreVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VisitReminder" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "recipientId" TEXT,
    "reminderMinutes" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VisitReminder_idempotencyKey_key" ON "VisitReminder"("idempotencyKey");
CREATE INDEX "VisitReminder_status_dueAt_idx" ON "VisitReminder"("status", "dueAt");
CREATE INDEX "VisitReminder_visitId_recipientId_idx" ON "VisitReminder"("visitId", "recipientId");
ALTER TABLE "VisitReminder" ADD CONSTRAINT "VisitReminder_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "StoreVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderFulfilment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "FulfilmentType" NOT NULL DEFAULT 'DELIVERY',
    "pickupSlotId" TEXT,
    "status" "PickupStatus" NOT NULL DEFAULT 'PENDING',
    "assignedStaffId" TEXT,
    "pickupCodeHash" TEXT,
    "pickupCodeExpiresAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "pickedUpById" TEXT,
    "manualHandoverNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderFulfilment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrderFulfilment_orderId_key" ON "OrderFulfilment"("orderId");
CREATE UNIQUE INDEX "OrderFulfilment_pickupCodeHash_key" ON "OrderFulfilment"("pickupCodeHash");
CREATE INDEX "OrderFulfilment_type_status_pickupSlotId_idx" ON "OrderFulfilment"("type", "status", "pickupSlotId");
CREATE INDEX "OrderFulfilment_assignedStaffId_status_idx" ON "OrderFulfilment"("assignedStaffId", "status");
ALTER TABLE "OrderFulfilment" ADD CONSTRAINT "OrderFulfilment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilment" ADD CONSTRAINT "OrderFulfilment_pickupSlotId_fkey" FOREIGN KEY ("pickupSlotId") REFERENCES "AppointmentSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilment" ADD CONSTRAINT "OrderFulfilment_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilment" ADD CONSTRAINT "OrderFulfilment_pickedUpById_fkey" FOREIGN KEY ("pickedUpById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PickupHistory" (
    "id" TEXT NOT NULL,
    "orderFulfilmentId" TEXT NOT NULL,
    "status" "PickupStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PickupHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PickupHistory_orderFulfilmentId_createdAt_idx" ON "PickupHistory"("orderFulfilmentId", "createdAt");
ALTER TABLE "PickupHistory" ADD CONSTRAINT "PickupHistory_orderFulfilmentId_fkey" FOREIGN KEY ("orderFulfilmentId") REFERENCES "OrderFulfilment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickupHistory" ADD CONSTRAINT "PickupHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
