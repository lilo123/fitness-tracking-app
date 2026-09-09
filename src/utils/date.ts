/**
 * Canonical Date & Local Timezone Utilities
 *
 * Provides timezone-safe date parsing, normalization, and local timestamp generation.
 * Guarantees that daily diary entries, macro tracking, and workout sessions are
 * strictly partitioned by the user's local solar/civil day (YYYY-MM-DD), decoupling
 * calendar tracking from astronomical UTC date drift.
 */

/**
 * Returns local YYYY-MM-DD string for a given Date or today.
 * Queries local calendar getters (getFullYear, getMonth, getDate)
 * to prevent UTC date rollover bugs.
 */
export function getLocalDateStr(date: Date = new Date()): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes any date input (string, Date, null, undefined) into YYYY-MM-DD.
 * If input is a string starting with YYYY-MM-DD, the prefix is preserved without timezone shifting.
 * If input is a Date object, local year/month/day are extracted.
 */
export function normalizeDateStr(val: string | Date | null | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return val.slice(0, 10);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val);
}

/**
 * Timezone-safe local day of week abbreviation extractor (e.g. 'Sun', 'Mon', 'Tue').
 * Avoids UTC date parsing shifts where UTC midnight becomes previous day in Western time zones.
 */
export function getDayOfWeekAbbr(dateStr: string): string {
  const norm = normalizeDateStr(dateStr);
  if (!norm) return '';
  const [year, month, day] = norm.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';
  const localDate = new Date(year, month - 1, day);
  if (
    isNaN(localDate.getTime()) ||
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return '';
  }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[localDate.getDay()] || '';
}

/**
 * Formats a date string (YYYY-MM-DD or ISO timestamp) into short human format (e.g. "Sep 8", "Jan 15").
 * Normalizes input first so full ISO timestamps (like Supabase timestamptz) are correctly parsed.
 */
export function formatShortDate(isoDateStr: string): string {
  if (!isoDateStr || typeof isoDateStr !== 'string') return '';
  const norm = normalizeDateStr(isoDateStr);
  const parts = norm.split('-');
  if (parts.length !== 3) return isoDateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = parseInt(parts[1], 10) - 1;
  const monthStr = months[mIdx] || parts[1];
  const dayStr = parseInt(parts[2], 10);
  if (isNaN(mIdx) || isNaN(dayStr)) return isoDateStr;
  return `${monthStr} ${dayStr}`;
}

/**
 * Generates an ISO-8601 UTC timestamp string anchored strictly to the
 * specified local calendar date string (YYYY-MM-DD) and local clock time.
 *
 * Guarantees:
 * 1. Date prefix strictly matches calendarDate (or defaults to local today if omitted/invalid).
 * 2. Time portion captures local hours, minutes, seconds with zero-padding.
 * 3. PostgreSQL timestamptz accepts the 'Z' suffix seamlessly.
 * 4. normalizeDateStr() will deterministically extract calendarDate back out.
 *
 * Example:
 *   formatLocalTimestamp("2026-09-08", new Date(2026, 8, 8, 20, 31, 20))
 *   => "2026-09-08T20:31:20Z"
 */
export function formatLocalTimestamp(calendarDate?: string | null, time: Date = new Date()): string {
  const validTime = time instanceof Date && !isNaN(time.getTime()) ? time : new Date();
  const validDateStr = calendarDate && /^\d{4}-\d{2}-\d{2}$/.test(calendarDate)
    ? calendarDate
    : (getLocalDateStr(validTime) || getLocalDateStr(new Date()));
  const hours = String(validTime.getHours()).padStart(2, '0');
  const minutes = String(validTime.getMinutes()).padStart(2, '0');
  const seconds = String(validTime.getSeconds()).padStart(2, '0');
  return `${validDateStr}T${hours}:${minutes}:${seconds}Z`;
}
