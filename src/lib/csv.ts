export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(headers: string[], rows: T[]): string {
  const headerLine = headers.map(escapeCell).join(",");
  const dataLines = rows.map(r => headers.map(h => escapeCell(r[h])).join(","));
  return [headerLine, ...dataLines].join("\n") + "\n";
}
