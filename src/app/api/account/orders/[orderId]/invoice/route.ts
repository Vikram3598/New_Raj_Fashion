import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createInvoicePdf, type InvoiceSnapshot } from "@/lib/account/invoice-pdf";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.mfaSatisfied) return NextResponse.json({ error: "Complete authenticator verification first." }, { status: 403 });
  const { orderId } = await params;
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: { items: true, payments: { select: { method: true, status: true } }, invoice: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const codDelivered = order.fulfilmentStatus === "DELIVERED" && order.payments.some((payment) => payment.method === "COD");
  if (!["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.paymentStatus) && !codDelivered) return NextResponse.json({ error: "An invoice is available after payment or cash-on-delivery delivery." }, { status: 409 });

  let invoice = order.invoice;
  if (!invoice) {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "store" } });
    const invoiceConfig = (settings?.invoiceConfig as { prefix?: string; footer?: string | null } | null) ?? {};
    const address = order.shippingSnapshot as { recipient?: string; line1?: string; line2?: string | null; city?: string; state?: string; postalCode?: string; country?: string; phone?: string | null };
    const snapshot: InvoiceSnapshot = {
      invoiceNo: `${invoiceConfig.prefix || "INV"}-${order.orderNumber}`,
      issuedAt: new Date().toISOString(),
      footer: invoiceConfig.footer,
      store: {
        name: settings?.storeName ?? "New Raj Fashion & Raj Saree Showroom",
        legalName: settings?.legalName,
        address: settings?.address ?? "Gandhi Chowk",
        city: settings?.city ?? "Sidhi",
        state: settings?.state ?? "Madhya Pradesh",
        postalCode: settings?.postalCode ?? "486661",
        phone: settings?.phone,
        email: settings?.email,
        gstin: settings?.gstin,
      },
      order: {
        orderNumber: order.orderNumber,
        recipient: address.recipient ?? "Customer",
        address: [address.line1, address.line2, `${address.city ?? ""}, ${address.state ?? ""} ${address.postalCode ?? ""}`, address.country].filter(Boolean).join("\n"),
        payment: order.payments.map((payment) => `${payment.method} / ${payment.status}`).join(", ") || order.paymentStatus,
        currency: order.currency,
        subtotalPaise: order.subtotalPaise,
        discountPaise: order.discountPaise,
        shippingPaise: order.shippingPaise,
        taxPaise: order.taxPaise,
        totalPaise: order.totalPaise,
      },
      items: order.items.map((item) => ({ name: item.productName, sku: item.sku, variant: item.variantTitle, quantity: item.quantity, unitPricePaise: item.unitPricePaise, taxPaise: item.taxPaise, discountPaise: item.discountPaise, totalPaise: item.lineTotalPaise })),
    };
    try {
      invoice = await prisma.invoice.create({ data: { orderId: order.id, invoiceNo: snapshot.invoiceNo, issuedAt: new Date(snapshot.issuedAt), snapshot: snapshot as never } });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "P2002") throw error;
      invoice = await prisma.invoice.findUniqueOrThrow({ where: { orderId: order.id } });
    }
  }
  const pdf = createInvoicePdf(invoice.snapshot as unknown as InvoiceSnapshot);
  return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoice.invoiceNo}.pdf"`, "Cache-Control": "private, no-store" } });
}
