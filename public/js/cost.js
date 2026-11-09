// Rough US repair costs, worked out from a parts range and typical shop hours, so that the
// numbers are transparent and anyone can redo them with their local labor rate.

export const LABOR_RATE = { low: 110, high: 180 };
const PARTS_MARKUP = 1.2; // Shops commonly charge more for parts than you'd pay yourself.

const roundToTen = (value) => Math.round(value / 10) * 10;

export function shopCost(fault, rate = LABOR_RATE) {
  if (fault.noRepair) return null;
  return {
    low: roundToTen(fault.parts[0] + fault.labor[0] * rate.low),
    high: roundToTen(fault.parts[1] * PARTS_MARKUP + fault.labor[1] * rate.high),
  };
}

export function diyCost(fault) {
  if (fault.noRepair || fault.diy === 'Shop only') return null;
  return { low: fault.parts[0], high: fault.parts[1] };
}

// Made once: building a number format on every call is slow, and pages show dozens of prices.
const DOLLARS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const money = (value) => `$${DOLLARS.format(Math.round(value))}`;
export const moneyRange = ({ low, high }) => `${money(low)} to ${money(high)}`;

/** Compares a quote with the typical range, for the quote checker. */
export function judgeQuote(fault, quote, rate = LABOR_RATE) {
  const range = shopCost(fault, rate);
  if (!range) return null;
  if (quote > range.high * 1.25) return { verdict: 'high', range };
  if (quote > range.high) return { verdict: 'upper', range };
  if (quote < range.low * 0.6) return { verdict: 'low', range };
  return { verdict: 'typical', range };
}
