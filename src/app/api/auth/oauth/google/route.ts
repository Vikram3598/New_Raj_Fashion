import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { randomToken } from "@/lib/crypto";

function getAppUrl(requestUrl: string) {
  const configured = process.env.APP_URL;
  const appUrl = new URL(configured || new URL(requestUrl).origin);
  if (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production.");
  }
  return appUrl.origin;
}

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  let appUrl: string;
  try { appUrl = getAppUrl(req.url); } catch { return NextResponse.json({ error: "Google sign-in configuration is invalid." }, { status: 503 }); }
  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 501 },
    );
  }
  const state = randomToken(16);
  const nonce = randomToken(32);
  const verifier = randomToken(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl}/api/auth/oauth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  const res = NextResponse.redirect(url);
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  res.cookies.set("nrf_oauth_state", state, cookieOptions);
  res.cookies.set("nrf_oauth_nonce", nonce, cookieOptions);
  res.cookies.set("nrf_oauth_verifier", verifier, cookieOptions);
  return res;
}
