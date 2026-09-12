/** Times and dates, formatted the way an Indian reader expects them. */

const CLOCK = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const WEEKDAY_LONG = new Intl.DateTimeFormat("en-IN", { weekday: "long" });
const DAY_MONTH = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const FULL = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function startOfDay(value: Date): number {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
}

/** "10:42 am" */
export function clockTime(iso: string): string {
  return CLOCK.format(new Date(iso));
}

/** "4 Sept" this year, "4 Sept 2025" otherwise. */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  return date.getFullYear() === new Date().getFullYear()
    ? DAY_MONTH.format(date)
    : FULL.format(date);
}

/** "4 Sept 2026" */
export function longDate(iso: string): string {
  return FULL.format(new Date(iso));
}

/** For a list row: "10:42 am", "Yesterday", "Tue", then a date. */
export function listTime(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return CLOCK.format(new Date(iso));
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAY.format(new Date(iso));
  return shortDate(iso);
}

/** For a divider inside a thread: "Today", "Yesterday", "Tuesday", a date. */
export function dayLabel(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAY_LONG.format(new Date(iso));
  return FULL.format(new Date(iso));
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** For alerts: "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return shortDate(iso);
}
