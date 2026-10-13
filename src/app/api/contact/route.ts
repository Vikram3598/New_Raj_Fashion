import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { assertRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { sendEmail } from "@/lib/notifications/providers";

const schema = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254).optional().or(z.literal("")), phone: z.string().trim().max(30).optional().or(z.literal("")), subject: z.string().trim().min(3).max(120), message: z.string().trim().min(20).max(4000) }).refine((value) => Boolean(value.email || value.phone), "Enter an email or phone number so the showroom can reply.");

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try { await assertRateLimit(`contact:${ip}`, 5, 60 * 60 * 1000); } catch (error) {
    if (error instanceof Error && error.message.startsWith("Too many")) return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json({ error: "The enquiry service is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the contact details and message." }, { status: 400 });
  const user = await getSessionUser();
  const requestRow = await prisma.supportRequest.create({ data: { userId: user?.id, name: parsed.data.name, emailNorm: parsed.data.email ? normalizeEmail(parsed.data.email) : null, phoneNorm: parsed.data.phone ? normalizePhone(parsed.data.phone) : null, subject: parsed.data.subject, message: parsed.data.message } });
  const settings = await prisma.storeSettings.findUnique({ where: { id: "store" }, select: { email: true } });
  if (settings?.email) {
    try { await sendEmail({ to: settings.email, subject: `Store enquiry: ${parsed.data.subject}`, text: `Request ${requestRow.id}\nFrom: ${parsed.data.name}\nEmail: ${parsed.data.email || "not provided"}\nPhone: ${parsed.data.phone || "not provided"}\n\n${parsed.data.message}`, templateKey: "support.request", idempotencyKey: `support-request:${requestRow.id}` }); } catch { /* Keep the saved enquiry available in the staff inbox if email delivery fails. */ }
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
