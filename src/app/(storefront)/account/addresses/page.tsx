import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AddressManager } from "@/components/account/address-manager";

export const metadata = { title: "Saved addresses" };

export default async function AddressesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const addresses = await prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, label: true, recipient: true, line1: true, line2: true, city: true, state: true, postalCode: true, phone: true, isDefault: true } });
  return <div className="card-nrf p-5 sm:p-6"><h2 className="font-serif text-3xl">Saved addresses</h2><div className="mt-5"><AddressManager initialAddresses={addresses} /></div></div>;
}
