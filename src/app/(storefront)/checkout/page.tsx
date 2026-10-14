import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { quoteCart } from "@/lib/commerce/pricing";
import { paiseToInr } from "@/lib/money";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { getStoreSettings } from "@/lib/store";
import { razorpayConfigured } from "@/lib/payments/razorpay";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/checkout");
  if (!user.mfaSatisfied) redirect("/auth/mfa/verify?next=%2Fcheckout");
  const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
  if (!cart) redirect("/cart");
  const addresses = await prisma.address.findMany({ where: { userId: user.id } });
  const settings = await getStoreSettings();
  const payCfg = (settings?.paymentConfig as { codEnabled?: boolean } | null) ?? {};
  let quote;
  try {
    quote = await quoteCart(cart.id);
  } catch (e) {
    return (
      <div className="container-nrf py-16">
        <h1 className="font-serif text-4xl">Checkout</h1>
        <p className="mt-4">{e instanceof Error ? e.message : "Unable to checkout"}</p>
      </div>
    );
  }
  return (
    <div className="container-nrf grid gap-8 py-10 lg:grid-cols-2">
      <div>
        <h1 className="font-serif text-4xl">Checkout</h1>
        <CheckoutForm addresses={addresses} codEnabled={Boolean(payCfg.codEnabled)} cashOnPickupEnabled={Boolean(settings?.allowCashOnPickup)} razorpayEnabled={razorpayConfigured()} store={{ name: settings?.storeName ?? "New Raj Fashion and Raj Saree Showroom", address: [settings?.address, settings?.city, settings?.state, settings?.postalCode].filter(Boolean).join(", "), openMinute: settings?.appointmentOpenMinute ?? 600, closeMinute: settings?.appointmentCloseMinute ?? 1200 }} />
      </div>
      <aside className="card-nrf h-fit p-5">
        <h2 className="font-medium">Order summary</h2>
        <ul className="mt-3 text-sm">
          {quote.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between py-1">
              <span>
                {l.productName} × {l.quantity}
              </span>
              <span>{paiseToInr(l.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4">Total payable: {paiseToInr(quote.totalPaise)}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Prices, taxes and delivery are recalculated on the server. A frontend payment success screen is never treated as proof of payment.
        </p>
      </aside>
    </div>
  );
}
