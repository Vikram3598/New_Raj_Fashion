import { NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 501 },
    );
  }
  const state = randomToken(16);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl}/auth/oauth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("nrf_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
