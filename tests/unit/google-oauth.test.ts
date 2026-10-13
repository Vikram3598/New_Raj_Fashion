import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyGoogleIdToken } from "@/lib/auth/google-oauth";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const clientId = "fashion-client.apps.googleusercontent.com";
const nonce = "request-nonce";

function token(claimOverrides: Record<string, unknown> = {}, signingKey = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: "https://accounts.google.com", aud: clientId, sub: "google-user-subject", nonce,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60,
    email: "customer@example.com", email_verified: true, name: "Customer", ...claimOverrides,
  })).toString("base64url");
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256"); signer.update(signingInput); signer.end();
  return `${signingInput}.${signer.sign(signingKey).toString("base64url")}`;
}

afterEach(() => vi.unstubAllGlobals());

describe("Google OpenID Connect token verification", () => {
  it("requires a verified RS256 signature and matching audience, issuer, expiry and nonce", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "max-age=3600" } })));
    const claims = await verifyGoogleIdToken(token(), clientId, nonce);
    expect(claims.sub).toBe("google-user-subject");
    expect(claims.email_verified).toBe(true);
    await expect(verifyGoogleIdToken(token({ aud: "another-client" }), clientId, nonce)).rejects.toThrow();
    await expect(verifyGoogleIdToken(token({ nonce: "another-request" }), clientId, nonce)).rejects.toThrow();
    await expect(verifyGoogleIdToken(token({ exp: Math.floor(Date.now() / 1000) - 1 }), clientId, nonce)).rejects.toThrow();
    await expect(verifyGoogleIdToken(token({ iss: "https://attacker.example" }), clientId, nonce)).rejects.toThrow();
  });

  it("rejects a token signed by an untrusted key and malformed JWTs", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    await expect(verifyGoogleIdToken("broken.token", clientId, nonce)).rejects.toThrow();
    await expect(verifyGoogleIdToken(token({}, other), clientId, nonce)).rejects.toThrow();
  });
});
