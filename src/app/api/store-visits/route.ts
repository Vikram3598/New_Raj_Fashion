import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/auth/rate-limit";
import { notifyVisit, recordVisitInAppNotifications, scheduleVisitReminders } from "@/lib/notifications/store-visits";
import { dateTimeInStoreZone, reserveStoreSlot, validateStoreSlot, createVisitReference } from "@/lib/store-slots";
import { sendEmail } from "@/lib/notifications/providers";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";

const itemSchema = z.object({
  productId: z.string().optional(), variantId: z.string().optional(), productName: z.string().trim().max(180).optional(),
  category: z.string().trim().max(100).optional(), size: z.string().trim().max(40).optional(), colour: z.string().trim().max(60).optional(),
  material: z.string().trim().max(80).optional(), quantity: z.number().int().min(1).max(20).default(1), budgetRupees: z.number().min(0).max(10000000).optional(),
  instructions: z.string().trim().max(1000).optional(),
}).refine((item) => Boolean(item.productId || item.productName), "Enter a product or describe your requirement.");

const requestSchema = z.object({
  customerName: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(20), email: z.string().trim().email().max(254).optional().or(z.literal("")),
  preferredContact: z.enum(["PHONE", "EMAIL", "WHATSAPP"]).default("PHONE"), existingCustomerId: z.string().trim().max(40).optional(),
  customerType: z.enum(["NEW", "RETURNING"]).optional(), peopleCount: z.number().int().min(1).max(30).optional(), durationMinutes: z.number().int().min(15).max(360).optional(),
  date: z.string(), time: z.string(), purpose: z.enum(["WEDDING", "BRIDAL", "GROOM", "FAMILY", "SAREE", "SUITING", "KIDS", "GENERAL", "OTHER"]),
  language: z.enum(["en", "hi"]).default("en"), totalBudgetRupees: z.number().min(0).max(100000000).optional(), itemBudgetRupees: z.number().min(0).max(10000000).optional(),
  familyMembers: z.number().int().min(1).max(30).optional(), preferredBrands: z.string().trim().max(300).optional(), clothingType: z.enum(["READY_MADE", "FABRIC", "EITHER"]).optional(),
  stitchingRequired: z.boolean().default(false), preferences: z.string().trim().max(2000).optional(), referenceImageUrl: z.string().regex(/^\/api\/store-visits\/reference-image\/[a-f0-9]{36}$/).optional(),
  verificationId: z.string().optional(), verificationCode: z.string().regex(/^\d{6}$/).optional(),
  items: z.array(itemSchema).max(20).default([]), generalRequirement: z.string().trim().max(2000).optional(),
}).refine((data) => data.items.length > 0 || Boolean(data.generalRequirement?.trim()), { message: "Add a product or describe what you are looking for.", path: ["items"] });

export async function POST(request: Request) {
  const user = await getSessionUser();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try { await assertRateLimit(`store-visit:${user?.id ?? ip}`, 5, 60 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 }); }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the visit details and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  const startsAt = dateTimeInStoreZone(data.date, data.time);
  if (!startsAt) return NextResponse.json({ error: "Choose a valid visit date and time." }, { status: 400 });
  const settings = await prisma.storeSettings.findUnique({ where: { id: "store" } });
  let verification: { id: string; contact: string; channel: "EMAIL" | "SMS"; codeHash: string } | null = null;
  if (!user) {
    if (!data.verificationId || !data.verificationCode) return NextResponse.json({ error: "Verify your email or phone before submitting a guest request." }, { status: 400 });
    const channel = data.email ? "EMAIL" : "SMS";
    const contact = channel === "EMAIL" ? normalizeEmail(data.email!) : normalizePhone(data.phone);
    const challenge = await prisma.storeVisitVerification.findUnique({ where: { id: data.verificationId } });
    const isValid = Boolean(challenge && challenge.contact === contact && challenge.channel === channel && !challenge.consumedAt && challenge.expiresAt > new Date() && challenge.attempts < 5 && safeEqual(challenge.codeHash, hmacSha256(`store-visit:${data.verificationId}:${data.verificationCode}`)));
    if (!isValid) {
      if (challenge && !challenge.consumedAt && challenge.attempts < 5) await prisma.storeVisitVerification.updateMany({ where: { id: challenge.id, consumedAt: null, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
      return NextResponse.json({ error: "The verification code is invalid or expired. Request a new code and try again." }, { status: 400 });
    }
    verification = { id: challenge!.id, contact, channel, codeHash: challenge!.codeHash };
  }
  const capacity = settings?.visitCapacity ?? 3;
  const hoursError = validateStoreSlot(startsAt, settings?.appointmentOpenMinute ?? 600, settings?.appointmentCloseMinute ?? 1200, settings?.openingHours);
  if (hoursError) return NextResponse.json({ error: hoursError }, { status: 400 });

  const preparedItems: Array<{ productId?: string; variantId?: string; productName: string; sku?: string; category?: string; imageUrl?: string; size?: string; colour?: string; material?: string; quantity: number; budgetPaise?: number; instructions?: string }> = [];
  for (const item of data.items) {
    if (!item.productId) {
      preparedItems.push({ productName: item.productName!, category: item.category, size: item.size, colour: item.colour, material: item.material, quantity: item.quantity, budgetPaise: item.budgetRupees == null ? undefined : Math.round(item.budgetRupees * 100), instructions: item.instructions });
      continue;
    }
    const product = await prisma.product.findFirst({
      where: { id: item.productId, status: "PUBLISHED" },
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        category: true,
        variants: { where: { isActive: true } },
      },
    });
    if (!product) return NextResponse.json({ error: "A selected product is no longer available. Please refresh and try again." }, { status: 409 });
    const variant = item.variantId ? product.variants.find((candidate) => candidate.id === item.variantId) : undefined;
    if (item.variantId && !variant) return NextResponse.json({ error: "A selected product option is no longer available." }, { status: 409 });
    preparedItems.push({ productId: product.id, variantId: variant?.id, productName: product.name, sku: variant?.sku ?? product.sku, category: item.category ?? product.category?.name, imageUrl: product.images[0]?.url, size: item.size ?? variant?.size ?? undefined, colour: item.colour ?? variant?.colour ?? undefined, material: item.material ?? product.material ?? product.fabric ?? undefined, quantity: item.quantity, budgetPaise: item.budgetRupees == null ? undefined : Math.round(item.budgetRupees * 100), instructions: item.instructions });
  }
  if (data.generalRequirement?.trim()) preparedItems.push({ productName: "General shopping requirement", category: "General", quantity: 1, instructions: data.generalRequirement.trim() });
  const message = `Your store visit request is received for ${data.date} at ${data.time}. We will confirm the requested time after checking availability.`;

  let visit;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      visit = await prisma.$transaction(async (tx) => {
        const slot = await reserveStoreSlot(tx, { kind: "VISIT", startsAt, capacity });
        if (verification) {
          const consumed = await tx.storeVisitVerification.updateMany({
            where: { id: verification.id, contact: verification.contact, channel: verification.channel, codeHash: verification.codeHash, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
            data: { consumedAt: new Date() },
          });
          if (!consumed.count) throw new Error("The verification code was already used or has expired.");
        }
        const created = await tx.storeVisit.create({
          data: {
            reference: createVisitReference(), userId: user?.id, slotId: slot.id,
            customerName: data.customerName, phone: data.phone.replace(/[^+\d]/g, "").slice(0, 16), email: data.email || null,
            preferredContact: data.preferredContact, existingCustomerId: data.existingCustomerId, customerType: data.customerType,
            peopleCount: data.peopleCount, durationMinutes: data.durationMinutes, purpose: data.purpose, language: data.language,
            totalBudgetPaise: data.totalBudgetRupees == null ? null : Math.round(data.totalBudgetRupees * 100),
            itemBudgetPaise: data.itemBudgetRupees == null ? null : Math.round(data.itemBudgetRupees * 100), familyMembers: data.familyMembers,
            preferredBrands: data.preferredBrands, clothingType: data.clothingType, stitchingRequired: data.stitchingRequired,
            preferences: [data.preferences, data.generalRequirement].filter(Boolean).join("\n\n") || null, referenceImageUrl: data.referenceImageUrl,
            items: { create: preparedItems },
            tasks: { create: [
              { key: "review", label: "Review customer requirements" }, { key: "availability", label: "Check product availability" },
              { key: "locate", label: "Locate requested products" }, { key: "prepare", label: "Prepare sizes and colours" },
              { key: "alternatives", label: "Suggest alternatives for unavailable items" },
            ] },
            history: { create: { toStatus: "PENDING", note: "Customer submitted a visit request." } },
          },
          include: { slot: true, items: true },
        });
        await scheduleVisitReminders(tx, created.id, created.slot.startsAt, settings?.visitReminderMinutes ?? [1440, 120, 30]);
        const title = `New store visit ${created.reference}`;
        await recordVisitInAppNotifications(tx, { visit: created, eventKey: `store-visit:${created.id}:created`, title, message });
        return created;
      });
      break;
    } catch (error) {
      if (attempt < 2 && error && typeof error === "object" && "code" in error && error.code === "P2002") continue;
      const message = error instanceof Error ? error.message : "Unable to save your visit request.";
      if (message.includes("no longer available") || message.includes("verification code was already used")) return NextResponse.json({ error: message }, { status: 409 });
      console.error("Store visit transaction failed.", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "Unable to save your visit request. Please try again." }, { status: 500 });
    }
  }
  if (!visit) return NextResponse.json({ error: "Unable to create a unique visit reference. Please try again." }, { status: 500 });
  await notifyVisit({ visit, eventKey: `store-visit:${visit.id}:created`, title: `New store visit ${visit.reference}`, message });
  if (!user && visit.email) {
    await Promise.allSettled([sendEmail({ to: visit.email, subject: `Store visit request ${visit.reference} received`, text: `${message}\nReference: ${visit.reference}\nThe requested slot is not confirmed until the store contacts you.`, templateKey: "store-visit.guest-confirmation", idempotencyKey: `store-visit:${visit.id}:guest-email` })]);
  }
  return NextResponse.json({ visit: { id: visit.id, reference: visit.reference, date: visit.slot.startsAt.toISOString(), status: visit.status, items: visit.items }, message }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in to view your store visits." }, { status: 401 });
  const visits = await prisma.storeVisit.findMany({
    where: { userId: user.id },
    select: {
      id: true, reference: true, customerName: true, status: true, purpose: true,
      totalBudgetPaise: true, preferences: true, createdAt: true,
      slot: { select: { startsAt: true } },
      items: { select: { id: true, productName: true, quantity: true, size: true, colour: true, instructions: true } },
      tasks: { select: { id: true, label: true, completed: true } },
    },
    orderBy: { slot: { startsAt: "asc" } },
  });
  return NextResponse.json({ visits });
}
