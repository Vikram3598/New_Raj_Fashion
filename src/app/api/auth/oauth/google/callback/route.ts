import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { verifyGoogleIdToken } from "@/lib/auth/google-oauth";
import { normalizeEmail } from "@/lib/normalize";
import { safeEqual } from "@/lib/crypto";

const oauthCookies = ["nrf_oauth_state", "nrf_oauth_nonce", "nrf_oauth_verifier"] as const;

function getAppUrl(requestUrl: string) {
  const appUrl = new URL(process.env.APP_URL || (process.env.NODE_ENV === "production" ? "" : new URL(requestUrl).origin));
  if (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") throw new Error("APP_URL must use HTTPS.");
  return appUrl.origin;
}

function finish(requestUrl: string, next: string) {
  let appUrl = new URL(requestUrl).origin;
  try { appUrl = getAppUrl(requestUrl); } catch { /* Return to the initiating app origin with a generic error. */ }
  const response = NextResponse.redirect(new URL(next, appUrl));
  for (const name of oauthCookies) response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  let appUrl: string;
  try { appUrl = getAppUrl(request.url); } catch { return finish(request.url, "/auth/login?error=google"); }
  const jar = await cookies();
  const state = jar.get("nrf_oauth_state")?.value;
  const nonce = jar.get("nrf_oauth_nonce")?.value;
  const verifier = jar.get("nrf_oauth_verifier")?.value;
  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!clientId || !clientSecret || !code || !state || !nonce || !verifier || !returnedState || !safeEqual(state, returnedState) || url.searchParams.has("error")) {
    return finish(request.url, "/auth/login?error=google");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/auth/oauth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    if (!tokenResponse.ok) return finish(request.url, "/auth/login?error=google");
    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token) return finish(request.url, "/auth/login?error=google");
    const identity = await verifyGoogleIdToken(tokens.id_token, clientId, nonce);

    let user = await prisma.user.findFirst({
      where: { oauthAccounts: { some: { provider: "google", providerAccountId: identity.sub } } },
      include: { totp: { select: { enabledAt: true } } },
    });
    if (!user) {
      const customerRole = await prisma.role.findUnique({ where: { name: "CUSTOMER" } });
      if (!customerRole) return finish(request.url, "/auth/login?error=google");
      const username = `g_${randomBytes(8).toString("hex")}`;
      const verifiedEmail = identity.email && identity.email_verified === true ? normalizeEmail(identity.email) : undefined;
      try {
        user = await prisma.user.create({
          data: {
            username,
            customerCode: `NRF${randomBytes(6).toString("hex").toUpperCase()}`,
            profile: { create: { fullName: identity.name?.trim().slice(0, 120) || "Customer" } },
            oauthAccounts: { create: { provider: "google", providerAccountId: identity.sub } },
            identities: verifiedEmail ? { create: { type: "EMAIL", valueNormalized: verifiedEmail, verifiedAt: new Date() } } : undefined,
            roles: { create: { roleId: customerRole.id } },
          },
          include: { totp: { select: { enabledAt: true } } },
        });
      } catch {
        // Handle a concurrent first sign-in for this same Google subject without linking by email.
        user = await prisma.user.findFirst({
          where: { oauthAccounts: { some: { provider: "google", providerAccountId: identity.sub } } },
          include: { totp: { select: { enabledAt: true } } },
        });
      }
    }
    if (!user || user.status !== "ACTIVE") return finish(request.url, "/auth/login?error=google");
    const mfaEnabled = Boolean(user.totp?.enabledAt);
    await createSession(user.id, { mfaSatisfied: !mfaEnabled });
    return finish(request.url, mfaEnabled ? "/auth/mfa/verify?next=%2Faccount" : "/account");
  } catch {
    return finish(request.url, "/auth/login?error=google");
  }
}
