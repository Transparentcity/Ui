/**
 * ISO week helpers. Week 1 is the week containing January 4; weeks start Monday.
 */

export function getISOYearAndWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const isoYear = d.getUTCFullYear();
  return { isoYear, isoWeek };
}

export function getISOWeeksInYear(year: number): number {
  return getISOYearAndWeek(new Date(year, 11, 28)).isoWeek;
}

/**
 * Monday of the given ISO week as a local Date.
 * January 4 is always in week 1, so walk back to that week's Monday
 * rather than the next Monday on/after Jan 4 (which is a week late
 * when Jan 4 falls on Friday–Sunday).
 */
export function getDateFromISOWeek(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4Day - 1));
  monday.setDate(monday.getDate() + (isoWeek - 1) * 7);
  return monday;
}
