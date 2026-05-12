export type FormatOptions = {
  symbol?: string;
  decimalPlaces?: number;
  thousandSeparator?: string;
  decimalSeparator?: string;
};

const DEFAULTS: Required<FormatOptions> = {
  symbol: "Br",
  decimalPlaces: 2,
  thousandSeparator: ",",
  decimalSeparator: ".",
};

function halfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function toCents(input: string): number {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`toCents: invalid input "${input}"`);
  }
  const n = Number(input);
  if (!Number.isFinite(n)) {
    throw new Error(`toCents: invalid input "${input}"`);
  }
  return halfUp(n * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatMoney(cents: number, opts: FormatOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;

  // Apply requested decimal places (round if < 2, pad if > 2)
  let display: string;
  if (o.decimalPlaces === 2) {
    display = `${whole.toLocaleString("en-US").replace(/,/g, o.thousandSeparator)}${o.decimalSeparator}${fraction.toString().padStart(2, "0")}`;
  } else {
    const asNumber = abs / 100;
    const rounded = halfUp(asNumber * Math.pow(10, o.decimalPlaces)) / Math.pow(10, o.decimalPlaces);
    const [w, f = ""] = rounded.toFixed(o.decimalPlaces).split(".");
    const wFmt = Number(w).toLocaleString("en-US").replace(/,/g, o.thousandSeparator);
    display = o.decimalPlaces === 0 ? wFmt : `${wFmt}${o.decimalSeparator}${f}`;
  }

  return `${o.symbol} ${negative ? "-" : ""}${display}`;
}

export function addCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function multiplyCents(cents: number, qty: number): number {
  return halfUp(cents * qty);
}
