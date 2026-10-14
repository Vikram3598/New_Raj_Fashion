import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { StaffStorePickups } from "@/components/shopkeeper/staff-store-pickups";
export const metadata = { title: "Assigned store pickups" };
export default async function StaffStorePickupsPage() {
  try { await requirePermission(PERMISSIONS.PICKUP_READ); } catch { redirect("/shopkeeper/login?next=/shopkeeper/staff/store-pickups"); }
  return <StaffStorePickups />;
}
