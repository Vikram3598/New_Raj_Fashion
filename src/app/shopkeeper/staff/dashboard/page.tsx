import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, PackageCheck, ScanSearch, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export const metadata = { title: "Staff workspace" };

export default async function StaffDashboard() {
  let staff;
  try { staff = await requireUser(); } catch { redirect("/shopkeeper/login"); }
  const canOrders = staff.permissions.includes(PERMISSIONS.ORDER_READ);
  const canInventory = staff.permissions.includes(PERMISSIONS.INVENTORY_READ);
  const canCustomers = staff.permissions.includes(PERMISSIONS.CUSTOMER_READ);
  if (!staff.roles.includes("STAFF") && !staff.roles.includes("OWNER")) redirect("/shopkeeper/login");
  if (!canOrders && !canInventory && !canCustomers) redirect("/shopkeeper/login");
  const [waiting, ready] = await Promise.all([
    canOrders ? prisma.order.count({ where: { fulfilmentStatus: { in: ["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING"] } } }) : Promise.resolve(null),
    canOrders ? prisma.order.count({ where: { fulfilmentStatus: "PACKED" } }) : Promise.resolve(null),
  ]);
  return <main className="container-nrf py-10"><p className="text-xs uppercase tracking-[.2em] text-maroon-700">Staff workspace</p><h1 className="mt-2 font-serif text-4xl">Good day, {staff.username}</h1><p className="mt-2 text-sm text-[var(--muted)]">The dashboard only shows areas your account can access.</p>
    {canOrders && <div className="mt-8 grid gap-4 sm:grid-cols-2"><article className="card-nrf p-5"><ClipboardList className="text-maroon-700"/><p className="mt-4 text-sm text-[var(--muted)]">Orders for processing</p><strong className="font-serif text-3xl">{waiting}</strong></article><article className="card-nrf p-5"><PackageCheck className="text-maroon-700"/><p className="mt-4 text-sm text-[var(--muted)]">Packed for dispatch</p><strong className="font-serif text-3xl">{ready}</strong></article></div>}
    <nav aria-label="Staff tools" className="mt-6 flex flex-wrap gap-3">{canOrders && <Link className="btn-primary" href="/shopkeeper/staff/orders">Open order fulfilment</Link>}{canInventory && <Link className="btn-secondary" href="/shopkeeper/staff/inventory-view"><ScanSearch size={16}/> Search inventory</Link>}{canCustomers && <><Link className="btn-secondary" href="/shopkeeper/staff/customers"><Users size={16}/> Limited customer list</Link><Link className="btn-secondary" href="/shopkeeper/staff/support">Customer enquiries</Link></>}</nav>
  </main>;
}
