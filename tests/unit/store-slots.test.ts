import { describe, expect, it } from "vitest";
import { dateTimeInStoreZone, operatingMinutesForDate, storeLocalDate, validateStoreSlot } from "../../src/lib/store-slots";

describe("store appointment time handling", () => {
  it("converts a Sidhi local slot to the correct instant", () => {
    const slot = dateTimeInStoreZone("2026-10-20", "10:00");
    expect(slot?.toISOString()).toBe("2026-10-20T04:30:00.000Z");
    expect(slot && storeLocalDate(slot)).toBe("2026-10-20");
  });

  it("rejects impossible dates and times instead of normalizing them", () => {
    expect(dateTimeInStoreZone("2026-02-31", "10:00")).toBeNull();
    expect(dateTimeInStoreZone("2026-10-20", "24:00")).toBeNull();
    expect(dateTimeInStoreZone("2026-10-20", "10:60")).toBeNull();
  });

  it("uses a dated closure in preference to a weekday opening schedule", () => {
    const schedule = operatingMinutesForDate("2026-10-20", { Tuesday: "10:00–20:00", "2026-10-20": "Closed" }, 600, 1200);
    expect(schedule.closed).toBe(true);
  });

  it("uses the configured weekday opening hours", () => {
    const schedule = operatingMinutesForDate("2026-10-20", { Tuesday: "11:00–19:00" }, 600, 1200);
    expect(schedule).toEqual({ openMinute: 660, closeMinute: 1140, closed: false });
  });

  it("rejects slots outside configured operating hours", () => {
    const slot = dateTimeInStoreZone("2026-10-20", "10:00")!;
    expect(validateStoreSlot(slot, 600, 1200, { Tuesday: "11:00–19:00" })).toMatch(/outside store/i);
    expect(validateStoreSlot(slot, 600, 1200, { Tuesday: "Closed" })).toMatch(/closed/i);
  });
});
