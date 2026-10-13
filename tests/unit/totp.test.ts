import { describe, expect, it } from "vitest";
import { Secret, TOTP } from "otpauth";
import { verifyTotpToken } from "@/lib/auth/totp";

describe("TOTP verification", () => {
  it("accepts the current six-digit authenticator code", () => {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({ secret, digits: 6, period: 30, algorithm: "SHA1" });
    const code = totp.generate();
    expect(verifyTotpToken(secret.base32, code)).toBe(true);
  });

  it("rejects malformed codes", () => {
    const secret = new Secret({ size: 20 });
    expect(verifyTotpToken(secret.base32, "not-a-code")).toBe(false);
  });
});
