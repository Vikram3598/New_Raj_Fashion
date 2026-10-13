import {describe,expect,it} from "vitest";
import {inrToPaise,paiseToInr} from "../../src/lib/money";
import {normalizeEmail,normalizePhone,normalizeUsername,slugify} from "../../src/lib/normalize";
describe("Indian storefront formatting helpers",()=>{
 it("converts rupees to paise and formats using the Indian locale",()=>{expect(inrToPaise(1234.56)).toBe(123456);expect(paiseToInr(123456)).toContain("1,234.56")});
 it("normalizes login identifiers",()=>{expect(normalizeEmail("  SHOP@Example.COM ")).toBe("shop@example.com");expect(normalizePhone("9876543210")).toBe("+919876543210");expect(normalizeUsername(" Raj.User ")).toBe("raj.user")});
 it("creates stable slugs from product names",()=>{expect(slugify("Banarasi Silk Saree!")).toBe("banarasi-silk-saree")});
});