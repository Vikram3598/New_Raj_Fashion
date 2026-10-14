import type { StoreVisit } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/providers";
import { storeDateLabel } from "@/lib/store-slots";

type VisitWithRelations = StoreVisit & { slot?: { startsAt: Date }; items?: { productName: string; quantity: number }[] };

export async function recordVisitInAppNotifications(tx: Prisma.TransactionClient, input: {
  visit: VisitWithRelations; eventKey: string; title: string; message: string; includeCustomer?: boolean;
}) {
  const owners = await tx.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: "OWNER" } } } },
    select: { id: true },
  });
  const assigned = input.visit.assignedStaffId ? await tx.user.findMany({
    where: { id: input.visit.assignedStaffId, status: "ACTIVE", staffProfile: { status: "ACTIVE" } },
    select: { id: true },
  }) : [];
  const customer = input.visit.userId ? [{ id: input.visit.userId }] : [];
  const recipients = [...new Map([...owners, ...assigned, ...customer].map((person) => [person.id, person])).values()]
    .filter((person) => input.includeCustomer !== false || person.id !== input.visit.userId);
  const now = new Date();
  return tx.notification.createMany({
    data: recipients.map((person) => ({
      userId: person.id,
      channel: "IN_APP" as const,
      templateKey: "store-visit.update",
      payload: {
        title: input.title,
        message: input.message,
        reference: input.visit.reference,
        href: person.id === input.visit.userId ? "/account/store-visits" : person.id === input.visit.assignedStaffId ? "/shopkeeper/staff/store-visits" : "/shopkeeper/owner/store-visits",
      },
      status: "SENT" as const,
      sentAt: now,
      idempotencyKey: `${input.eventKey}:in-app:${person.id}`,
    })),
    skipDuplicates: true,
  });
}

async function getRecipients(visit: StoreVisit) {
  const owners = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: "OWNER" } } } },
    select: { id: true, username: true, identities: { where: { type: "EMAIL", verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } },
  });
  const assigned = visit.assignedStaffId ? await prisma.user.findMany({
    where: { id: visit.assignedStaffId, status: "ACTIVE", staffProfile: { status: "ACTIVE" } },
    select: { id: true, username: true, identities: { where: { type: "EMAIL", verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } },
  }) : [];
  const customer = visit.userId ? await prisma.user.findMany({
    where: { id: visit.userId },
    select: { id: true, username: true, identities: { where: { type: "EMAIL", verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } },
  }) : [];
  return [...new Map([...owners, ...assigned, ...customer].map((person) => [person.id, person])).values()];
}

export async function notifyVisit(input: { visit: VisitWithRelations; eventKey: string; title: string; message: string; includeCustomer?: boolean }) {
  try {
  const recipients = await getRecipients(input.visit);
  const permitted = recipients.filter((person) => input.includeCustomer !== false || person.id !== input.visit.userId);
  const now = new Date();
  await prisma.notification.createMany({
    data: permitted.map((person) => ({
      userId: person.id, channel: "IN_APP" as const, templateKey: "store-visit.update",
      payload: { title: input.title, message: input.message, reference: input.visit.reference, href: person.id === input.visit.userId ? "/account/store-visits" : person.id === input.visit.assignedStaffId ? "/shopkeeper/staff/store-visits" : "/shopkeeper/owner/store-visits" },
      status: "SENT" as const, sentAt: now, idempotencyKey: `${input.eventKey}:in-app:${person.id}`,
    })),
    skipDuplicates: true,
  });
  await Promise.allSettled(permitted.flatMap((person) => {
    const email = person.identities[0]?.valueNormalized;
    return email ? [sendEmail({
      userId: person.id, to: email, subject: input.title,
      text: `${input.message}\nReference: ${input.visit.reference}${input.visit.slot ? `\nArrival: ${storeDateLabel(input.visit.slot.startsAt)}` : ""}`,
      templateKey: "store-visit.update", idempotencyKey: `${input.eventKey}:email:${person.id}`,
    })] : [];
  }));
  return { inAppRecipients: permitted.length };
  } catch (error) {
    console.error("Store visit notification could not be recorded.", error instanceof Error ? error.message : error);
    return { inAppRecipients: 0, error: "Notification recording failed" };
  }
}

export async function scheduleVisitReminders(tx: Prisma.TransactionClient, visitId: string, startsAt: Date, minutes: number[]) {
  const now = new Date();
  const times = [...new Set(minutes.filter((value) => Number.isInteger(value) && value > 0 && value <= 10080))];
  const reminders = times.map((reminderMinutes) => ({
    visitId, reminderMinutes, dueAt: new Date(startsAt.getTime() - reminderMinutes * 60_000),
    idempotencyKey: `store-visit:${visitId}:${startsAt.toISOString()}:${reminderMinutes}`,
  })).filter((reminder) => reminder.dueAt > now);
  if (reminders.length) await tx.visitReminder.createMany({ data: reminders, skipDuplicates: true });
}

export async function runDueVisitReminders(now = new Date()) {
  const due = await prisma.visitReminder.findMany({
    where: { status: "QUEUED", dueAt: { lte: now }, visit: { status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] } } },
    orderBy: { dueAt: "asc" }, take: 100,
    include: { visit: { include: { slot: true, items: { select: { productName: true, quantity: true } } } } },
  });
  let sent = 0;
  for (const reminder of due) {
    const claim = await prisma.visitReminder.updateMany({ where: { id: reminder.id, status: "QUEUED" }, data: { status: "SENDING" } });
    if (!claim.count) continue;
    try {
      const title = `Upcoming store visit ${reminder.visit.reference}`;
      const result = await notifyVisit({
        visit: reminder.visit,
        eventKey: reminder.idempotencyKey,
        title,
        message: `Reminder: the customer is expected in ${reminder.reminderMinutes} minutes.`,
        includeCustomer: true,
      });
      if (result.error) throw new Error(result.error);
      if (!reminder.visit.userId && reminder.visit.email) {
        await sendEmail({
          to: reminder.visit.email,
          subject: title,
          text: `Reminder: your store visit is expected in ${reminder.reminderMinutes} minutes. Reference: ${reminder.visit.reference}.`,
          templateKey: "store-visit.guest-reminder",
          idempotencyKey: `${reminder.idempotencyKey}:guest-email`,
        });
      }
      await prisma.visitReminder.update({ where: { id: reminder.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
      sent++;
    } catch (error) {
      await prisma.visitReminder.update({ where: { id: reminder.id }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Reminder processing failed" } });
    }
  }
  return { found: due.length, sent };
}
