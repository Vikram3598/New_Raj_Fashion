import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/i18n/locale-provider";

const navigation = [
  ["/shopkeeper/owner", "Overview"],
  ["/shopkeeper/owner/products", "Products"],
  ["/shopkeeper/owner/categories", "Categories"],
  ["/shopkeeper/owner/inventory", "Inventory"],
  ["/shopkeeper/owner/orders", "Orders"],
  ["/shopkeeper/owner/store-visits", "Store visits"],
  ["/shopkeeper/owner/store-pickups", "Store pickups"],
  ["/shopkeeper/owner/payments", "Payments"],
  ["/shopkeeper/owner/refunds", "Refunds"],
  ["/shopkeeper/owner/promotions", "Promotions"],
  ["/shopkeeper/owner/banners", "Banners"],
  ["/shopkeeper/owner/customers", "Customers"],
  ["/shopkeeper/owner/support", "Enquiries"],
  ["/shopkeeper/owner/reviews", "Reviews"],
  ["/shopkeeper/owner/reports", "Reports"],
  ["/shopkeeper/owner/staff", "Staff"],
  ["/shopkeeper/owner/settings", "Settings"],
  ["/shopkeeper/owner/audit-logs", "Audit log"],
] as const;

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  try { await requireOwner(); } catch { redirect("/shopkeeper/login?next=/shopkeeper/owner"); }
  return <div className="min-h-[70vh]"><nav aria-label="Owner console" className="border-b border-stone-200 bg-[var(--bg)] dark:border-stone-800"><div className="container-nrf flex items-center gap-2 overflow-x-auto py-3">{navigation.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap rounded-full border border-stone-200 px-3 py-1.5 text-sm hover:border-maroon-700 hover:text-maroon-700 dark:border-stone-700">{label}</Link>)}<span className="ml-auto inline-flex items-center gap-2"><LocaleSwitcher compact /><ThemeToggle /></span></div></nav>{children}</div>;
}
