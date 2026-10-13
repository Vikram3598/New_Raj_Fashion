import { createPublicKey, verify as verifySignature, type JsonWebKey as NodeJsonWebKey } from "node:crypto";

type GoogleJwk = NodeJsonWebKey & { kid?: string; alg?: string; use?: string };
type GoogleJwks = { keys: GoogleJwk[] };
type GoogleClaims = {
  aud: string | string[];
  azp?: string;
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  nonce: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

let cachedKeys: { value: GoogleJwks; expiresAt: number } | undefined;

async function getGoogleJwks() {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.value;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Google signing keys are unavailable.");
  const value = (await response.json()) as GoogleJwks;
  if (!Array.isArray(value.keys)) throw new Error("Google signing keys are invalid.");
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 3600);
  cachedKeys = { value, expiresAt: Date.now() + Math.max(60, Math.min(maxAge, 86400)) * 1000 };
  return value;
}

export async function verifyGoogleIdToken(token: string, clientId: string, expectedNonce: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("Invalid Google ID token.");
  let header: { alg?: string; kid?: string };
  let claims: GoogleClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as typeof header;
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as GoogleClaims;
  } catch {
    throw new Error("Invalid Google ID token.");
  }
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Google ID token.");

  let jwks = await getGoogleJwks();
  let jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.use !== "enc");
  if (!jwk) {
    cachedKeys = undefined;
    jwks = await getGoogleJwks();
    jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.use !== "enc");
  }
  if (!jwk) throw new Error("Google signing key was not found.");
  const signature = Buffer.from(parts[2], "base64url");
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  if (!verifySignature("RSA-SHA256", signingInput, createPublicKey({ key: jwk, format: "jwk" }), signature)) {
    throw new Error("Invalid Google ID token signature.");
  }

  const now = Math.floor(Date.now() / 1000);
  const audienceMatches = Array.isArray(claims.aud) ? claims.aud.includes(clientId) : claims.aud === clientId;
  if (
    !audienceMatches ||
    (Array.isArray(claims.aud) && claims.azp !== clientId) ||
    (claims.azp !== undefined && claims.azp !== clientId) ||
    !["https://accounts.google.com", "accounts.google.com"].includes(claims.iss) ||
    !Number.isFinite(claims.exp) || claims.exp <= now ||
    !Number.isFinite(claims.iat) || claims.iat > now + 300 ||
    claims.nonce !== expectedNonce ||
    typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 255
  ) {
    throw new Error("Google ID token claims did not match this sign-in request.");
  }
  return claims;
}
