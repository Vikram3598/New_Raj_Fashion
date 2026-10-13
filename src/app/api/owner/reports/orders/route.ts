import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { csvDocument } from "@/lib/csv";

function validDate(value: string | null) { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value); }

export async function GET(request: Request) {
  try { await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDate(from) || !validDate(to) || from! > to!) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  const fromAt = new Date(`${from}T00:00:00+05:30`);
  const until = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({ where: { createdAt: { gte: fromAt, lt: until } }, orderBy: { createdAt: "asc" }, include: { user: { select: { customerCode: true } }, items: true, payments: { select: { method: true, status: true, providerPaymentId: true } } } });
  const headers = ["order_number", "created_at", "customer_code", "fulfilment_status", "payment_status", "items", "subtotal_paise", "discount_paise", "shipping_paise", "tax_paise", "total_paise", "payment_methods", "provider_references"];
  const rows = orders.map((order) => [order.orderNumber, order.createdAt.toISOString(), order.user.customerCode, order.fulfilmentStatus, order.paymentStatus, order.items.map((item) => `${item.productName} (${item.variantTitle}) x ${item.quantity}`).join("; "), order.subtotalPaise, order.discountPaise, order.shippingPaise, order.taxPaise, order.totalPaise, order.payments.map((payment) => `${payment.method}:${payment.status}`).join("; "), order.payments.map((payment) => payment.providerPaymentId).filter(Boolean).join("; ")]);
  return new Response(`\uFEFF${csvDocument(headers, rows)}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=raj-fashion-orders-${from}-${to}.csv`, "Cache-Control": "private, no-store" } });
}
