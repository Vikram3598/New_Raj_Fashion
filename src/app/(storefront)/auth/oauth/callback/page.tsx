import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/normalize";
import { randomBytes } from "node:crypto";

export default async function OAuthCallback({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  const sp = await searchParams;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return (
      <div className="container-nrf py-16">
        <h1 className="font-serif text-3xl">Google sign-in is not configured</h1>
        <p className="mt-3">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this option.</p>
      </div>
    );
  }
  const jar = await cookies();
  if (!sp.code || !sp.state || sp.state !== jar.get("nrf_oauth_state")?.value) {
    return (
      <div className="container-nrf py-16">
        <h1 className="font-serif text-3xl">Google sign-in failed</h1>
      </div>
    );
  }
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: sp.code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${appUrl}/auth/oauth/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) {
    return (
      <div className="container-nrf py-16">
        <h1 className="font-serif text-3xl">Google sign-in failed</h1>
      </div>
    );
  }
  const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString()) as {
    sub: string;
    email?: string;
    name?: string;
  };
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: payload.sub } },
  });
  let userId = existing?.userId;
  if (!userId) {
    const customerRole = await prisma.role.findUnique({ where: { name: "CUSTOMER" } });
    const username = `g_${payload.sub.slice(0, 12)}`;
    const user = await prisma.user.create({
      data: {
        username,
        customerCode: `NRF${randomBytes(3).toString("hex").toUpperCase()}`,
        profile: { create: { fullName: payload.name ?? "Customer" } },
        oauthAccounts: { create: { provider: "google", providerAccountId: payload.sub } },
        identities: payload.email
          ? { create: { type: "EMAIL", valueNormalized: normalizeEmail(payload.email), verifiedAt: new Date() } }
          : undefined,
        roles: { create: { roleId: customerRole!.id } },
      },
    });
    userId = user.id;
  }
  await createSession(userId, { mfaSatisfied: true });
  redirect("/account");
}
