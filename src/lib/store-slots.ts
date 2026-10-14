import { randomBytes } from "node:crypto";
import type { AppointmentSlotKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export function dateTimeInStoreZone(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const value = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(value.getTime()) || storeLocalDate(value) !== date) return null;
  const local = storeTimeParts(value);
  return local.hour === hour && local.minute === minute ? value : null;
}

export function storeTimeParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(value);
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")), minute: Number(get("minute")), weekday: get("weekday") };
}

export function storeLocalDate(value: Date) {
  const p = storeTimeParts(value);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function operatingMinutesForDate(date: string, openingHours: unknown, fallbackOpen: number, fallbackClose: number) {
  const hours = openingHours && typeof openingHours === "object" && !Array.isArray(openingHours) ? openingHours as Record<string, unknown> : {};
  const dateAtNoon = dateTimeInStoreZone(date, "12:00");
  const weekday = dateAtNoon ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "long" }).format(dateAtNoon) : "";
  const configured = hours[date] ?? hours[weekday];
  if (typeof configured !== "string") return { openMinute: fallbackOpen, closeMinute: fallbackClose, closed: false };
  if (/closed|holiday|off/i.test(configured)) return { openMinute: fallbackOpen, closeMinute: fallbackClose, closed: true };
  const match = configured.match(/(\d{1,2}):(\d{2})\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})/i);
  if (!match) return { openMinute: fallbackOpen, closeMinute: fallbackClose, closed: false };
  const openMinute = Number(match[1]) * 60 + Number(match[2]);
  const closeMinute = Number(match[3]) * 60 + Number(match[4]);
  if (openMinute < 0 || openMinute > 1380 || closeMinute < 60 || closeMinute > 1440 || closeMinute <= openMinute) return { openMinute: fallbackOpen, closeMinute: fallbackClose, closed: true };
  return { openMinute, closeMinute, closed: false };
}

export function validateStoreSlot(start: Date, openMinute: number, closeMinute: number, openingHours?: unknown) {
  const now = new Date();
  if (start.getTime() <= now.getTime() + 15 * 60 * 1000) return "Choose a slot at least 15 minutes in the future.";
  const p = storeTimeParts(start);
  const schedule = operatingMinutesForDate(storeLocalDate(start), openingHours, openMinute, closeMinute);
  if (schedule.closed) return "The store is closed on that date.";
  openMinute = schedule.openMinute;
  closeMinute = schedule.closeMinute;
  const minuteOfDay = p.hour * 60 + p.minute;
  if (p.minute !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) return "Choose an available whole-hour slot.";
  if (minuteOfDay < openMinute || minuteOfDay + 60 > closeMinute) return "That time is outside store appointment hours.";
  return null;
}

export async function reserveStoreSlot(tx: Prisma.TransactionClient, input: {
  kind: AppointmentSlotKind; startsAt: Date; capacity: number;
}) {
  const endsAt = new Date(input.startsAt.getTime() + 60 * 60 * 1000);
  const slot = await tx.appointmentSlot.upsert({
    where: { kind_startsAt: { kind: input.kind, startsAt: input.startsAt } },
    update: {},
    create: { kind: input.kind, startsAt: input.startsAt, endsAt, capacity: input.capacity },
  });
  const claim = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "AppointmentSlot"
    SET "reservedCount" = "reservedCount" + 1, "updatedAt" = NOW()
    WHERE id = ${slot.id}
      AND "closed" = false
      AND "reservedCount" < "capacity"
    RETURNING id
  `;
  if (!claim.length) throw new Error("That time slot is no longer available. Please choose another time.");
  return tx.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } });
}

export async function releaseStoreSlot(tx: Prisma.TransactionClient, slotId: string) {
  await tx.appointmentSlot.updateMany({
    where: { id: slotId, reservedCount: { gt: 0 } },
    data: { reservedCount: { decrement: 1 } },
  });
}

export function createVisitReference(at = new Date()) {
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(at);
  return `RV-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function storeDateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(value);
}

export async function getOrCreateAvailabilitySlot(input: { kind: AppointmentSlotKind; startsAt: Date; capacity: number }) {
  return prisma.appointmentSlot.upsert({
    where: { kind_startsAt: { kind: input.kind, startsAt: input.startsAt } },
    update: { capacity: input.capacity },
    create: { kind: input.kind, startsAt: input.startsAt, endsAt: new Date(input.startsAt.getTime() + 3600000), capacity: input.capacity },
  });
}
