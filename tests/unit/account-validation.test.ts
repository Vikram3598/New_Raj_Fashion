import { describe, expect, it } from "vitest";
import { addressSchema, profileSchema } from "@/lib/account/validation";

describe("customer account validation", () => {
  it("trims a profile name and rejects blank or oversized names", () => {
    expect(profileSchema.parse({ fullName: "  Asha Raj  " })).toEqual({ fullName: "Asha Raj" });
    expect(profileSchema.safeParse({ fullName: "   " }).success).toBe(false);
    expect(profileSchema.safeParse({ fullName: "x".repeat(121) }).success).toBe(false);
  });

  it("accepts a valid Indian address and defaults it to non-default", () => {
    const address = addressSchema.parse({ label: "Home", recipient: "Asha", line1: "1 Main Road", city: "Sidhi", state: "Madhya Pradesh", postalCode: "486661" });
    expect(address.isDefault).toBe(false);
    expect(address.postalCode).toBe("486661");
  });

  it("rejects malformed Indian PIN codes and ignores browser-supplied ownership fields", () => {
    const valid = { label: "Home", recipient: "Asha", line1: "1 Main Road", city: "Sidhi", state: "Madhya Pradesh", postalCode: "486661", userId: "attacker" };
    expect(addressSchema.safeParse({ ...valid, postalCode: "086661" }).success).toBe(false);
    expect(addressSchema.parse(valid)).not.toHaveProperty("userId");
  });
});
