import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { StaffStoreVisits } from "@/components/shopkeeper/staff-store-visits";
export const metadata = { title: "Assigned store visits" };
export default async function StaffStoreVisitsPage() {
  try { await requirePermission(PERMISSIONS.STORE_VISIT_READ); } catch { redirect("/shopkeeper/login?next=/shopkeeper/staff/store-visits"); }
  return <StaffStoreVisits />;
}
