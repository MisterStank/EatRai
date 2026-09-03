import type { Lang } from "../api/client";

// Google's weekdayDescriptions are localized strings like "Monday: 9 AM – 10 PM"
// or "วันจันทร์: 09:00–22:00". Their order is locale-dependent, so we match the
// day name in the text instead of trusting the array index.

const DAY_NAMES: Record<Lang, string[]> = {
  // index 0 = Sunday, matching JS Date.getDay()
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  th: ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"],
};

export function todayHours(lines: string[] | undefined, lang: Lang): string {
  if (!lines?.length) return "";
  const name = DAY_NAMES[lang][new Date().getDay()];
  const hit = lines.find((l) => l.includes(name));
  return hit ?? lines[0];
}

export function isTodayLine(line: string, lang: Lang): boolean {
  const name = DAY_NAMES[lang][new Date().getDay()];
  return line.includes(name);
}
