export type HHMM = { hours: number; minutes: number };

export function parseHHMM(s: string): HHMM {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`parseHHMM: invalid "${s}"`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`parseHHMM: out of range "${s}"`);
  }
  return { hours, minutes };
}

function partsInTimezone(d: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

export function businessDate(now: Date, cutoffHHMM: string, tz: string): string {
  const { hours: ch, minutes: cm } = parseHHMM(cutoffHHMM);
  const p = partsInTimezone(now, tz);
  const minutesIntoDay = p.hour * 60 + p.minute;
  const cutoffMinutes = ch * 60 + cm;

  // Build a date object representing local midnight, then subtract a day if before cutoff
  const local = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (minutesIntoDay < cutoffMinutes) {
    local.setUTCDate(local.getUTCDate() - 1);
  }
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayBusinessDate(cutoffHHMM: string, tz: string): string {
  return businessDate(new Date(), cutoffHHMM, tz);
}
