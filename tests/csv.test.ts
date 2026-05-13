import { describe, it, expect } from "vitest";
import { toCsv, escapeCell } from "../src/lib/csv";

describe("escapeCell", () => {
  it("returns unquoted plain strings", () => {
    expect(escapeCell("Almaz")).toBe("Almaz");
    expect(escapeCell(123)).toBe("123");
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
  });

  it("quotes when the value contains comma, quote, or newline", () => {
    expect(escapeCell("a, b")).toBe('"a, b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsv", () => {
  it("builds CSV from header + rows", () => {
    const csv = toCsv(
      ["name", "qty", "total"],
      [
        { name: "Latte", qty: 3, total: 1500 },
        { name: "Espresso, Single", qty: 2, total: 600 },
      ],
    );
    expect(csv).toBe(
      'name,qty,total\nLatte,3,1500\n"Espresso, Single",2,600\n',
    );
  });

  it("handles empty rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\n");
  });
});
