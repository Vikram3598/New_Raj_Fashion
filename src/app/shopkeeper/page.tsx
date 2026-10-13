import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function ShopkeeperPortalEntry() {
  const user = await getSessionUser();
  if (!user) redirect("/shopkeeper/login");
  if (!user.mfaSatisfied) redirect("/auth/mfa/verify?next=%2Fshopkeeper");
  if (user.roles.includes("OWNER")) redirect("/shopkeeper/owner");
  if (user.roles.includes("STAFF")) redirect("/shopkeeper/staff/dashboard");
  redirect("/shopkeeper/login");
}
