import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDueVisitReminders } from "@/lib/notifications/store-visits";
import { runDuePickupReminders } from "@/lib/notifications/store-pickups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Reminder scheduler is not configured." }, { status: 503 });
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const [visits, pickups] = await Promise.all([runDueVisitReminders(), runDuePickupReminders()]);
    return NextResponse.json({ ok: true, visits, pickups });
  } catch {
    return NextResponse.json({ error: "Reminder processing failed." }, { status: 500 });
  }
}
