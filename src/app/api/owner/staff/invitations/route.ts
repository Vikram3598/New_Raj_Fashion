import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { hashSessionToken, randomToken } from "@/lib/crypto";
import { sendEmail, sendSms } from "@/lib/notifications/providers";

const schema = z.object({ email: z.string().trim().email().max(254).optional().or(z.literal("")), phone: z.string().trim().min(7).max(30).optional().or(z.literal("")) }).refine((value) => Boolean(value.email || value.phone), "Enter an email address or phone number.");

export async function POST(request: Request) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter an email address or phone number." }, { status: 400 });
  const emailNorm = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
  const phoneNorm = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (phoneNorm && !/^\+\d{10,15}$/.test(phoneNorm)) return NextResponse.json({ error: "Enter a valid international phone number or a 10-digit Indian number." }, { status: 400 });
  const matchingContacts = [
    ...(emailNorm ? [{ emailNorm }] : []),
    ...(phoneNorm ? [{ phoneNorm }] : []),
  ];
  const exists = await prisma.staffInvitation.findFirst({ where: { acceptedAt: null, expiresAt: { gt: new Date() }, OR: matchingContacts }, select: { id: true } });
  if (exists) return NextResponse.json({ error: "A pending invitation already exists for that email or phone." }, { status: 409 });
  const token = randomToken(32);
  const invitation = await prisma.$transaction(async (tx) => {
    const created = await tx.staffInvitation.create({ data: { emailNorm, phoneNorm, tokenHash: hashSessionToken(token), invitedById: actor.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "staff.invitation.create", entityType: "StaffInvitation", entityId: created.id, metadata: { email: Boolean(emailNorm), phone: Boolean(phoneNorm) } } });
    return created;
  });
  const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  const inviteUrl = new URL(`/shopkeeper/invite?token=${encodeURIComponent(token)}`, appUrl).toString();
  let emailQueued = false;
  let smsQueued = false;
  try {
    if (emailNorm) { const result = await sendEmail({ to: emailNorm, subject: "Invitation to New Raj Fashion staff portal", text: `You have been invited to the New Raj Fashion staff portal. Sign in or create an account with this verified email, then accept the invitation: ${inviteUrl}`, templateKey: "staff.invitation", idempotencyKey: `staff-invitation:${invitation.id}:email` }); emailQueued = result.status === "SENT"; }
    if (phoneNorm) { const result = await sendSms({ to: phoneNorm, text: `New Raj Fashion invited you to staff access. Sign in with this verified phone, then accept: ${inviteUrl}`, templateKey: "staff.invitation", idempotencyKey: `staff-invitation:${invitation.id}:sms` }); smsQueued = result.status === "SENT"; }
  } catch { /* The owner can still share the one-time invite URL manually. */ }
  return NextResponse.json({ id: invitation.id, inviteUrl, expiresAt: invitation.expiresAt.toISOString(), emailQueued, smsQueued }, { status: 201 });
}
