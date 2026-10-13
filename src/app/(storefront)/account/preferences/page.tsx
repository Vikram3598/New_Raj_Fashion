import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { CommunicationPreferences } from "@/components/account/communication-preferences";

export const metadata = { title: "Communication preferences" };

export default async function PreferencesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const preferences = await prisma.communicationPreference.upsert({
    where: { userId: user.id }, create: { userId: user.id }, update: {},
    select: { emailOffers: true, smsOffers: true, orderUpdates: true },
  });
  return <CommunicationPreferences initial={preferences} />;
}
