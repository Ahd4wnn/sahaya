/** Money, names and availability -- formatted the way an Indian reader expects. */

/** Paise -> a compact rupee string. 1_450_000 -> "14,500". */
export function rupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(paise / 100),
  );
}

/** The wage cell on the card. Collapses a zero-width range to one figure. */
export function wageRange(min: number, max: number): string {
  if (!min && !max) return "Ask";
  if (!max || min === max) return `₹${rupees(min)}`;
  return `₹${rupees(min)}–${rupees(max)}`;
}

const SHIFT_LABELS: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  full_day: "Full day",
};

export function shiftLabel(shift: string): string {
  return SHIFT_LABELS[shift] ?? shift;
}

/** "Full day · 8 hrs" -- the availability line in the card footer. */
export function availabilityLine(shifts: string[], hoursPerDay: number): string {
  const shiftText = shifts.length
    ? shifts.map(shiftLabel).join(", ")
    : "Flexible";
  return `${shiftText} · ${hoursPerDay} hrs`;
}

/** Initials for the monogram fallback, capped at two letters. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * A stable tint per person, so a monogram is not the same colour for
 * everyone but also does not change between renders.
 */
export function monogramTint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  // Hues either side of the moss header (#728156 sits at 82deg), and
  // desaturated: a grid of fallbacks should read as one product, not as a
  // bag of sweets. Saturation is what makes a placeholder shout, so it is the
  // thing kept low.
  const hues = [58, 70, 82, 94, 106, 46];
  const hue = hues[hash % hues.length]!;
  return `hsl(${hue} 16% 50%)`;
}

export function experienceLabel(years: number): string {
  if (years <= 0) return "New";
  return `${years} yr${years === 1 ? "" : "s"}`;
}

export function ratingLabel(avg: number | null, count: number): string | null {
  if (!avg || !count) return null;
  return avg.toFixed(1);
}

/** "Sujatha" from "Sujatha Menon" -- for "Message Sujatha". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}
