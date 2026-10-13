import { describe, expect, it } from "vitest";
import { allocateProportionally } from "@/lib/commerce/pricing";

describe("checkout line allocation", () => {
  it("allocates discount paise exactly without exceeding line values", () => {
    const lines = [10001, 2999, 7000];
    const discount = allocateProportionally(1_234, lines);
    expect(discount.reduce((sum, value) => sum + value, 0)).toBe(1_234);
    expect(discount.every((value, index) => value <= lines[index])).toBe(true);
  });

  it("handles zero totals and large integer amounts exactly", () => {
    expect(allocateProportionally(500, [0, 0])).toEqual([0, 0]);
    const values = allocateProportionally(90_000_000_000, [100_000_000_000, 200_000_000_000, 300_000_000_000]);
    expect(values.reduce((sum, value) => sum + value, 0)).toBe(90_000_000_000);
  });
});
