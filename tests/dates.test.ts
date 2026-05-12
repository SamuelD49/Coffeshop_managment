import { describe, it, expect } from "vitest";
import { businessDate, parseHHMM, todayBusinessDate } from "../src/lib/dates";

describe("parseHHMM", () => {
  it("parses HH:MM strings", () => {
    expect(parseHHMM("00:00")).toEqual({ hours: 0, minutes: 0 });
    expect(parseHHMM("04:30")).toEqual({ hours: 4, minutes: 30 });
    expect(parseHHMM("23:59")).toEqual({ hours: 23, minutes: 59 });
  });
  it("throws on invalid input", () => {
    expect(() => parseHHMM("24:00")).toThrow();
    expect(() => parseHHMM("12:60")).toThrow();
    expect(() => parseHHMM("abc")).toThrow();
  });
});

describe("businessDate", () => {
  const tz = "Africa/Addis_Ababa";

  it("returns calendar date when cutoff is 00:00", () => {
    const result = businessDate(new Date("2026-05-12T20:00:00Z"), "00:00", tz);
    // 20:00 UTC = 23:00 EAT on 2026-05-12
    expect(result).toBe("2026-05-12");
  });

  it("rolls back to prior day when timestamp is before cutoff", () => {
    // 01:00 EAT with cutoff 04:00 → belongs to previous day
    const result = businessDate(new Date("2026-05-12T22:00:00Z"), "04:00", tz);
    // 22:00 UTC May 12 = 01:00 EAT May 13; before 04:00 cutoff, so belongs to May 12
    expect(result).toBe("2026-05-12");
  });

  it("uses the new day when timestamp is at or after cutoff", () => {
    // 05:00 EAT with cutoff 04:00 → belongs to the same day
    const result = businessDate(new Date("2026-05-13T02:00:00Z"), "04:00", tz);
    // 02:00 UTC May 13 = 05:00 EAT May 13; after 04:00 cutoff
    expect(result).toBe("2026-05-13");
  });
});

describe("todayBusinessDate", () => {
  it("returns a string in YYYY-MM-DD format", () => {
    const today = todayBusinessDate("00:00", "Africa/Addis_Ababa");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
