import { describe, it, expect } from "vitest";
import { toCents, fromCents, formatMoney, addCents, multiplyCents } from "../src/lib/money";

describe("toCents", () => {
  it("converts a whole-number string to cents", () => {
    expect(toCents("10")).toBe(1000);
  });
  it("converts a decimal string to cents", () => {
    expect(toCents("10.50")).toBe(1050);
  });
  it("rounds half-up at the cent boundary", () => {
    expect(toCents("10.555")).toBe(1056);
    expect(toCents("10.554")).toBe(1055);
  });
  it("handles zero", () => {
    expect(toCents("0")).toBe(0);
  });
  it("throws on invalid input", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("")).toThrow();
  });
});

describe("fromCents", () => {
  it("converts cents back to a number with 2 decimals", () => {
    expect(fromCents(1050)).toBe(10.5);
    expect(fromCents(0)).toBe(0);
    expect(fromCents(99)).toBe(0.99);
  });
});

describe("formatMoney", () => {
  it("formats with default ETB Br symbol and 2 decimals", () => {
    expect(formatMoney(1050)).toBe("Br 10.50");
    expect(formatMoney(0)).toBe("Br 0.00");
    expect(formatMoney(123456)).toBe("Br 1,234.56");
  });
  it("respects custom symbol and decimals", () => {
    expect(formatMoney(1050, { symbol: "$", decimalPlaces: 2 })).toBe("$ 10.50");
    expect(formatMoney(1050, { symbol: "Br", decimalPlaces: 0 })).toBe("Br 11");
  });
  it("handles negative amounts", () => {
    expect(formatMoney(-1050)).toBe("Br -10.50");
  });
});

describe("addCents", () => {
  it("sums an array of cent values", () => {
    expect(addCents([100, 200, 300])).toBe(600);
    expect(addCents([])).toBe(0);
    expect(addCents([-100, 100])).toBe(0);
  });
});

describe("multiplyCents", () => {
  it("multiplies cents by a whole quantity", () => {
    expect(multiplyCents(1050, 3)).toBe(3150);
  });
  it("multiplies cents by a fractional quantity and rounds half-up", () => {
    // 1050 * 1.5 = 1575
    expect(multiplyCents(1050, 1.5)).toBe(1575);
    // 333 * 3 = 999 (no rounding needed)
    expect(multiplyCents(333, 3)).toBe(999);
    // 100 * (1/3) = 33.333... → rounds to 33
    expect(multiplyCents(100, 1 / 3)).toBe(33);
  });
});
