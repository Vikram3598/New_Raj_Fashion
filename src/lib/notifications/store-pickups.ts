import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/providers";
import { storeDateLabel } from "@/lib/store-slots";

export async function notifyPickup(input: { orderId: string; eventKey: string; title: string; message: string; includeCustomer?: boolean; includePickupDetails?: boolean }) {
  try {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      user: { select: { id: true, identities: { where: { type: "EMAIL", verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } } },
      items: { select: { productName: true, quantity: true, variantTitle: true } },
      fulfilment: { select: { assignedStaffId: true, pickupSlot: { select: { startsAt: true } } } },
    },
  });
  if (!order) return;
  let message = input.message;
  if (input.includePickupDetails) {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "store" }, select: { storeName: true, address: true, city: true, state: true, postalCode: true } });
    const address = [settings?.address, settings?.city, settings?.state, settings?.postalCode].filter(Boolean).join(", ");
    const items = order.items.map((item) => `• ${item.productName}${item.variantTitle ? ` (${item.variantTitle})` : ""} × ${item.quantity}`).join("\n");
    message = `${message}\nPickup at: ${settings?.storeName ?? "New Raj Fashion and Raj Saree Showroom"}${address ? `, ${address}` : ""}.${order.fulfilment?.pickupSlot ? `\nScheduled slot: ${storeDateLabel(order.fulfilment.pickupSlot.startsAt)}.` : ""}${items ? `\nItems:\n${items}` : ""}\nFor handover, ask the customer to show the one-time code from their account. Never ask them to send the code by email or message.`;
  }
  const owners = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { name: "OWNER" } } } }, select: { id: true, identities: { where: { type: "EMAIL", verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } } });
  const staff = order.fulfilment?.assignedStaffId
    ? await prisma.user.findMany({
        where: { id: order.fulfilment.assignedStaffId, status: "ACTIVE", staffProfile: { status: "ACTIVE" } },
        select: {
          id: true,
          identities: {
            where: { type: "EMAIL", verifiedAt: { not: null } },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
      })
    : [];
  const people = [...new Map([...owners, ...staff].map((person) => [person.id, person])).values()];
  await prisma.notification.createMany({
    data: [
      ...people.map((person) => ({ userId: person.id, channel: "IN_APP" as const, templateKey: "store-pickup.update", payload: { title: input.title, message, orderNumber: order.orderNumber, href: person.id === order.fulfilment?.assignedStaffId ? "/shopkeeper/staff/store-pickups" : "/shopkeeper/owner/store-pickups" }, status: "SENT" as const, sentAt: new Date(), idempotencyKey: `${input.eventKey}:in-app:${person.id}` })),
      ...(input.includeCustomer === false ? [] : [{ userId: order.userId, channel: "IN_APP" as const, templateKey: "store-pickup.update", payload: { title: input.title, message, orderNumber: order.orderNumber, href: `/account/orders/${order.id}` }, status: "SENT" as const, sentAt: new Date(), idempotencyKey: `${input.eventKey}:in-app:${order.userId}` }]),
    ],
    skipDuplicates: true,
  });
  const externalRecipients = [
    ...people.map((person) => ({ id: person.id, email: person.identities[0]?.valueNormalized })),
    ...(input.includeCustomer === false ? [] : [{ id: order.userId, email: order.user.identities[0]?.valueNormalized }]),
  ];
  await Promise.allSettled(externalRecipients.flatMap(({ id, email }) => email ? [sendEmail({ userId: id, to: email, subject: input.title, text: `${message}\nOrder: ${order.orderNumber}`, templateKey: "store-pickup.update", idempotencyKey: `${input.eventKey}:email:${id}` })] : []));
  return {};
  } catch (error) {
    console.error("Store pickup notification could not be recorded.", error instanceof Error ? error.message : error);
    return { error: "Notification recording failed" };
  }
}

export async function schedulePickupReminders(tx: Prisma.TransactionClient, fulfilmentId: string, startsAt: Date, minutes: number[]) {
  const now = new Date();
  const times = [...new Set(minutes.filter((value) => Number.isInteger(value) && value > 0 && value <= 10080))];
  const reminders = times.map((reminderMinutes) => ({
    fulfilmentId,
    reminderMinutes,
    dueAt: new Date(startsAt.getTime() - reminderMinutes * 60_000),
    idempotencyKey: `store-pickup:${fulfilmentId}:${startsAt.toISOString()}:${reminderMinutes}`,
  })).filter((reminder) => reminder.dueAt > now);
  if (reminders.length) await tx.pickupReminder.createMany({ data: reminders, skipDuplicates: true });
}

export async function runDuePickupReminders(now = new Date()) {
  const due = await prisma.pickupReminder.findMany({
    where: {
      status: "QUEUED",
      dueAt: { lte: now },
      fulfilment: { status: { in: ["PENDING", "PREPARING", "READY", "SCHEDULED", "ARRIVED"] } },
    },
    orderBy: { dueAt: "asc" },
    take: 100,
    include: { fulfilment: { include: { order: true, pickupSlot: true } } },
  });
  let sent = 0;
  for (const reminder of due) {
    const claim = await prisma.pickupReminder.updateMany({ where: { id: reminder.id, status: "QUEUED" }, data: { status: "SENDING" } });
    if (!claim.count) continue;
    try {
      const pickup = reminder.fulfilment;
      const settings = await prisma.storeSettings.findUnique({ where: { id: "store" }, select: { storeName: true, address: true, city: true, state: true, postalCode: true } });
      const address = [settings?.address, settings?.city, settings?.state, settings?.postalCode].filter(Boolean).join(", ");
      const result = await notifyPickup({
        orderId: pickup.orderId,
        eventKey: reminder.idempotencyKey,
        title: `Pickup reminder for ${pickup.order.orderNumber}`,
        message: `Reminder: your order is scheduled for pickup in ${reminder.reminderMinutes} minutes at ${storeDateLabel(pickup.pickupSlot?.startsAt ?? new Date())}. ${settings?.storeName ?? "New Raj Fashion and Raj Saree Showroom"}, ${address}.`,
      });
      if (result?.error) throw new Error(result.error);
      await prisma.pickupReminder.update({ where: { id: reminder.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
      sent++;
    } catch (error) {
      await prisma.pickupReminder.update({ where: { id: reminder.id }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Pickup reminder processing failed" } });
    }
  }
  return { found: due.length, sent };
}
