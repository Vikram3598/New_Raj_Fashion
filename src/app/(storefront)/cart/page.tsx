import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { quoteCart } from "@/lib/commerce/pricing";
import { paiseToInr } from "@/lib/money";
import { CartEditor } from "@/components/storefront/cart-editor";
import { CartCoupon } from "@/components/storefront/cart-coupon";

export const metadata = { title: "Cart" };

export default async function CartPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <div className="container-nrf py-16">
        <h1 className="font-serif text-4xl">Cart</h1>
        <p className="mt-4">
          <Link href="/auth/login?next=/cart" className="text-maroon-700">
            Sign in
          </Link>{" "}
          to keep your cart across devices.
        </p>
      </div>
    );
  }
  const cart = await prisma.cart.findFirst({
    where: { userId: user.id },
    include: { items: { include: { variant: { include: { product: { include: { images: true } } } } } } },
  });
  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-nrf py-16">
        <h1 className="font-serif text-4xl">Cart</h1>
        <p className="mt-4 text-[var(--muted)]">Your cart is empty.</p>
        <Link href="/shop" className="btn-primary mt-6">
          Continue shopping
        </Link>
      </div>
    );
  }
  let quote = null;
  let error: string | null = null;
  try {
    quote = await quoteCart(cart.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unable to price cart";
  }
  return (
    <div className="container-nrf py-10">
      <h1 className="font-serif text-4xl">Cart</h1>
      <CartEditor
        items={cart.items.map((i) => ({
          id: i.id,
          name: i.variant.product.name,
          title: i.variant.title,
          quantity: i.quantity,
          pricePaise: i.variant.pricePaise,
        }))}
      />
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {quote ? (
        <aside className="card-nrf mt-8 max-w-md p-5">
          <p>Subtotal: {paiseToInr(quote.subtotalPaise)}</p>
          <p>Discount: {paiseToInr(quote.discountPaise)}</p>
          <p>Delivery: {paiseToInr(quote.shippingPaise)}</p>
          <p>Tax: {paiseToInr(quote.taxPaise)}</p>
          <p className="mt-2 font-medium">Total: {paiseToInr(quote.totalPaise)}</p>
          <CartCoupon initialCode={cart.couponCode} />
          <Link href="/checkout" className="btn-primary mt-4 w-full">
            Checkout
          </Link>
        </aside>
      ) : error ? <aside className="card-nrf mt-8 max-w-md p-5"><p className="text-sm text-red-700">{error}</p><p className="mt-2 text-sm">Update or remove the coupon to recalculate your cart.</p><CartCoupon initialCode={cart.couponCode} /></aside> : null}
    </div>
  );
}
