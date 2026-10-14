import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dateTimeInStoreZone, operatingMinutesForDate, storeLocalDate } from "@/lib/store-slots";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["VISIT", "PICKUP"]).default("VISIT") }).safeParse({ date: url.searchParams.get("date"), kind: url.searchParams.get("kind") ?? "VISIT" });
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
  const settings = await prisma.storeSettings.findUnique({ where: { id: "store" } });
  let openMinute = settings?.appointmentOpenMinute ?? 600;
  let closeMinute = settings?.appointmentCloseMinute ?? 1200;
  const capacity = parsed.data.kind === "VISIT" ? (settings?.visitCapacity ?? 3) : (settings?.pickupCapacity ?? 5);
  const first = dateTimeInStoreZone(parsed.data.date, "00:00");
  if (!first || storeLocalDate(first) !== parsed.data.date || parsed.data.date < storeLocalDate(new Date())) return NextResponse.json({ slots: [] });
  const schedule = operatingMinutesForDate(parsed.data.date, settings?.openingHours, openMinute, closeMinute);
  if (schedule.closed) return NextResponse.json({ slots: [], closedDay: true, timezone: "Asia/Kolkata" });
  openMinute = schedule.openMinute;
  closeMinute = schedule.closeMinute;
  if (openMinute < 0 || closeMinute > 1440 || closeMinute <= openMinute) return NextResponse.json({ slots: [], closedDay: true, timezone: "Asia/Kolkata" });
  const daySlots = await prisma.appointmentSlot.findMany({ where: { kind: parsed.data.kind, startsAt: { gte: first, lt: new Date(first.getTime() + 24 * 60 * 60 * 1000) } } });
  const existing = new Map(daySlots.map((slot) => [slot.startsAt.toISOString(), slot]));
  const slots: { time: string; available: number; closed: boolean }[] = [];
  for (let minute = openMinute; minute + 60 <= closeMinute; minute += 60) {
    const date = new Date(`${parsed.data.date}T00:00:00+05:30`);
    date.setTime(date.getTime() + minute * 60_000);
    const slot = existing.get(date.toISOString());
    const available = slot ? Math.max(0, slot.capacity - slot.reservedCount) : capacity;
    const closed = slot?.closed ?? false;
    slots.push({ time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`, available: closed ? 0 : available, closed });
  }
  return NextResponse.json({ slots, timezone: "Asia/Kolkata", storeName: settings?.storeName, address: [settings?.address, settings?.city, settings?.state, settings?.postalCode].filter(Boolean).join(", ") });
}
