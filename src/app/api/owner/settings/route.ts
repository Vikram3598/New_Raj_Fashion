import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({
  storeName: z.string().trim().min(2).max(160).optional(), legalName: z.string().trim().max(160).nullable().optional(),
  address: z.string().trim().min(3).max(250).optional(), city: z.string().trim().min(2).max(100).optional(), state: z.string().trim().min(2).max(100).optional(), postalCode: z.string().trim().min(4).max(12).optional(),
  phone: z.string().trim().max(30).nullable().optional(), email: z.string().trim().email().max(254).nullable().optional(), gstin: z.string().trim().max(20).nullable().optional(),
  openingHours: z.record(z.string(), z.string()).nullable().optional(),
  policyReturns: z.string().max(10000).nullable().optional(), policyShipping: z.string().max(10000).nullable().optional(), policyPrivacy: z.string().max(10000).nullable().optional(), policyTerms: z.string().max(10000).nullable().optional(),
  codEnabled: z.boolean().optional(), deliveryFeeRupees: z.number().min(0).max(10000000).optional(), freeDeliveryAboveRupees: z.number().positive().max(10000000).nullable().optional(),
  allowedPostalCodes: z.array(z.string().regex(/^\d{6}$/)).max(500).optional(), taxRatePercent: z.number().min(0).max(100).optional(),
  invoicePrefix: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/).optional(), invoiceFooter: z.string().trim().max(500).nullable().optional(),
  allowCashOnPickup: z.boolean().optional(), visitCapacity: z.number().int().min(1).max(100).optional(), pickupCapacity: z.number().int().min(1).max(100).optional(),
  visitReminderMinutes: z.array(z.number().int().min(1).max(10080)).max(5).optional(), pickupReminderMinutes: z.array(z.number().int().min(1).max(10080)).max(5).optional(), appointmentOpenMinute: z.number().int().min(0).max(1380).optional(), appointmentCloseMinute: z.number().int().min(60).max(1440).optional(),
});

export async function PATCH(request: Request) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the store settings and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { codEnabled, openingHours, deliveryFeeRupees, freeDeliveryAboveRupees, allowedPostalCodes, taxRatePercent, invoicePrefix, invoiceFooter, allowCashOnPickup, visitCapacity, pickupCapacity, visitReminderMinutes, pickupReminderMinutes, appointmentOpenMinute, appointmentCloseMinute, ...fields } = parsed.data;
  if (appointmentOpenMinute !== undefined && appointmentCloseMinute !== undefined && appointmentCloseMinute <= appointmentOpenMinute) return NextResponse.json({ error: "Closing time must be after opening time." }, { status: 400 });
  try {
    const current = await prisma.storeSettings.findUnique({ where: { id: "store" } });
    if (!current) return NextResponse.json({ error: "Store settings are not seeded." }, { status: 503 });
    const paymentConfig = { ...((current.paymentConfig as Record<string, unknown> | null) ?? {}), ...(codEnabled !== undefined ? { codEnabled } : {}) };
    const deliveryRules = { ...((current.deliveryRules as Record<string, unknown> | null) ?? {}), ...(deliveryFeeRupees !== undefined ? { feePaise: Math.round(deliveryFeeRupees * 100) } : {}), ...(freeDeliveryAboveRupees !== undefined ? { freeAbovePaise: freeDeliveryAboveRupees === null ? null : Math.round(freeDeliveryAboveRupees * 100) } : {}), ...(allowedPostalCodes !== undefined ? { allowedPostalCodes } : {}) };
    const taxConfig = { ...((current.taxConfig as Record<string, unknown> | null) ?? {}), ...(taxRatePercent !== undefined ? { rateBps: Math.round(taxRatePercent * 100) } : {}) };
    const invoiceConfig = { ...((current.invoiceConfig as Record<string, unknown> | null) ?? {}), ...(invoicePrefix !== undefined ? { prefix: invoicePrefix } : {}), ...(invoiceFooter !== undefined ? { footer: invoiceFooter } : {}) };
    const data = {
      ...fields,
      ...(openingHours !== undefined ? { openingHours: openingHours === null ? Prisma.DbNull : openingHours as Prisma.InputJsonValue } : {}),
      ...(codEnabled !== undefined ? { paymentConfig: paymentConfig as Prisma.InputJsonValue } : {}),
      ...(allowCashOnPickup !== undefined ? { allowCashOnPickup } : {}),
      ...(visitCapacity !== undefined ? { visitCapacity } : {}), ...(pickupCapacity !== undefined ? { pickupCapacity } : {}),
      ...(visitReminderMinutes !== undefined ? { visitReminderMinutes: [...new Set(visitReminderMinutes)].sort((a, b) => b - a) } : {}),
      ...(pickupReminderMinutes !== undefined ? { pickupReminderMinutes: [...new Set(pickupReminderMinutes)].sort((a, b) => b - a) } : {}),
      ...(appointmentOpenMinute !== undefined ? { appointmentOpenMinute } : {}), ...(appointmentCloseMinute !== undefined ? { appointmentCloseMinute } : {}),
      ...(deliveryFeeRupees !== undefined || freeDeliveryAboveRupees !== undefined || allowedPostalCodes !== undefined ? { deliveryRules: deliveryRules as Prisma.InputJsonValue } : {}),
      ...(taxRatePercent !== undefined ? { taxConfig: taxConfig as Prisma.InputJsonValue } : {}),
      ...(invoicePrefix !== undefined || invoiceFooter !== undefined ? { invoiceConfig: invoiceConfig as Prisma.InputJsonValue } : {}),
    };
    await prisma.$transaction([
      prisma.storeSettings.update({ where: { id: "store" }, data }),
      prisma.auditLog.create({ data: { actorId: actor.id, action: "store.settings.update", entityType: "StoreSettings", entityId: "store", metadata: { fields: Object.keys(parsed.data) } } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Store settings could not be saved." }, { status: 400 }); }
}
