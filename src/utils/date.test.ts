import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getLocalDateStr,
  normalizeDateStr,
  getDayOfWeekAbbr,
  formatShortDate,
  formatLocalTimestamp,
} from './date';

describe('Canonical Date Utility (src/utils/date.ts)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getLocalDateStr', () => {
    it('returns local YYYY-MM-DD for a specific Date object', () => {
      const d = new Date(2026, 8, 8, 20, 30, 0); // Sept 8, 2026 20:30 local
      expect(getLocalDateStr(d)).toBe('2026-09-08');
    });

    it('handles single-digit months and days with zero-padding', () => {
      const d = new Date(2026, 0, 5, 9, 5, 0); // Jan 5, 2026
      expect(getLocalDateStr(d)).toBe('2026-01-05');
    });

    it('handles leap day (Feb 29, 2024)', () => {
      const d = new Date(2024, 1, 29, 12, 0, 0); // Feb 29, 2024
      expect(getLocalDateStr(d)).toBe('2024-02-29');
    });

    it('handles non-leap year (Feb 28, 2026)', () => {
      const d = new Date(2026, 1, 28, 23, 59, 59); // Feb 28, 2026
      expect(getLocalDateStr(d)).toBe('2026-02-28');
    });

    it('handles month boundary rollovers correctly', () => {
      // End of 31-day month to 1st of next month
      expect(getLocalDateStr(new Date(2026, 0, 31, 23, 59, 59))).toBe('2026-01-31');
      expect(getLocalDateStr(new Date(2026, 1, 1, 0, 0, 0))).toBe('2026-02-01');

      // End of 30-day month (April) to May 1
      expect(getLocalDateStr(new Date(2026, 3, 30, 23, 59, 59))).toBe('2026-04-30');
      expect(getLocalDateStr(new Date(2026, 4, 1, 0, 0, 0))).toBe('2026-05-01');

      // Leap year boundary: Feb 28 -> Feb 29 -> Mar 1
      expect(getLocalDateStr(new Date(2024, 1, 28, 23, 59, 59))).toBe('2024-02-28');
      expect(getLocalDateStr(new Date(2024, 1, 29, 12, 0, 0))).toBe('2024-02-29');
      expect(getLocalDateStr(new Date(2024, 2, 1, 0, 0, 0))).toBe('2024-03-01');
    });

    it('handles year boundary rollover (Dec 31 to Jan 1)', () => {
      const newYearsEve = new Date(2025, 11, 31, 23, 59, 59);
      const newYearsDay = new Date(2026, 0, 1, 0, 0, 0);
      expect(getLocalDateStr(newYearsEve)).toBe('2025-12-31');
      expect(getLocalDateStr(newYearsDay)).toBe('2026-01-01');
    });

    it('defaults to current system time when called without arguments', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 8, 21, 15, 0));
      expect(getLocalDateStr()).toBe('2026-09-08');
    });

    it('preserves local date across late-night hours without rolling over into UTC tomorrow', () => {
      vi.useFakeTimers();
      // Suppose local time is 11:45 PM on Sept 8
      vi.setSystemTime(new Date(2026, 8, 8, 23, 45, 0));
      expect(getLocalDateStr()).toBe('2026-09-08');
    });

    it('returns empty string gracefully for invalid Date objects or null', () => {
      expect(getLocalDateStr(new Date('invalid date'))).toBe('');
      expect(getLocalDateStr(null as any)).toBe('');
    });
  });

  describe('Local date generation across timezones (PDT UTC-7, UTC, JST UTC+9)', () => {
    it('correctly models evening date divergence (8:30 PM PDT / 03:30 UTC / 12:30 JST)', () => {
      // Scenario 1: Physical instant 2026-09-09T03:30:00Z
      // In PDT (UTC-7): local clock is 20:30 on Sept 8
      const pdtClock = new Date(2026, 8, 8, 20, 30, 0);
      expect(getLocalDateStr(pdtClock)).toBe('2026-09-08');

      // In UTC: local clock is 03:30 on Sept 9
      const utcClock = new Date(2026, 8, 9, 3, 30, 0);
      expect(getLocalDateStr(utcClock)).toBe('2026-09-09');

      // In JST (UTC+9): local clock is 12:30 on Sept 9
      const jstClock = new Date(2026, 8, 9, 12, 30, 0);
      expect(getLocalDateStr(jstClock)).toBe('2026-09-09');
    });

    it('correctly models morning date divergence (4:30 PM PDT / 23:30 UTC / 08:30 JST next day)', () => {
      // Scenario 2: Physical instant 2026-09-08T23:30:00Z
      // In PDT (UTC-7): local clock is 16:30 on Sept 8
      const pdtClock = new Date(2026, 8, 8, 16, 30, 0);
      expect(getLocalDateStr(pdtClock)).toBe('2026-09-08');

      // In UTC: local clock is 23:30 on Sept 8
      const utcClock = new Date(2026, 8, 8, 23, 30, 0);
      expect(getLocalDateStr(utcClock)).toBe('2026-09-08');

      // In JST (UTC+9): local clock is 08:30 on Sept 9
      const jstClock = new Date(2026, 8, 9, 8, 30, 0);
      expect(getLocalDateStr(jstClock)).toBe('2026-09-09');
    });
  });

  describe('normalizeDateStr', () => {
    it('returns empty string for null, undefined, or empty input', () => {
      expect(normalizeDateStr(null)).toBe('');
      expect(normalizeDateStr(undefined)).toBe('');
      expect(normalizeDateStr('')).toBe('');
    });

    it('extracts YYYY-MM-DD prefix from ISO strings without timezone conversion', () => {
      expect(normalizeDateStr('2026-09-08T23:50:00.000Z')).toBe('2026-09-08');
      expect(normalizeDateStr('2026-09-08T00:00:00+00:00')).toBe('2026-09-08');
      expect(normalizeDateStr('2026-09-08T12:30:45-07:00')).toBe('2026-09-08');
      expect(normalizeDateStr('2026-09-08T20:30:00-07:00')).toBe('2026-09-08');
      expect(normalizeDateStr('2026-09-09T12:30:00+09:00')).toBe('2026-09-09');
    });

    it('returns YYYY-MM-DD string unchanged', () => {
      expect(normalizeDateStr('2026-09-08')).toBe('2026-09-08');
    });

    it('formats valid Date instances into local YYYY-MM-DD', () => {
      const d = new Date(2026, 8, 8, 15, 30, 0);
      expect(normalizeDateStr(d)).toBe('2026-09-08');
    });

    it('handles invalid Date instances gracefully', () => {
      const invalidDate = new Date('invalid date string');
      expect(normalizeDateStr(invalidDate)).toBe('Invalid Date');
    });

    it('handles non-ISO parseable strings', () => {
      expect(normalizeDateStr('September 8, 2026')).toBe('2026-09-08');
    });
  });

  describe('getDayOfWeekAbbr', () => {
    it('correctly maps dates to weekday abbreviations across full week', () => {
      expect(getDayOfWeekAbbr('2026-09-06')).toBe('Sun');
      expect(getDayOfWeekAbbr('2026-09-07')).toBe('Mon');
      expect(getDayOfWeekAbbr('2026-09-08')).toBe('Tue');
      expect(getDayOfWeekAbbr('2026-09-09')).toBe('Wed');
      expect(getDayOfWeekAbbr('2026-09-10')).toBe('Thu');
      expect(getDayOfWeekAbbr('2026-09-11')).toBe('Fri');
      expect(getDayOfWeekAbbr('2026-09-12')).toBe('Sat');
    });

    it('handles ISO timestamps with timezone offset cleanly', () => {
      expect(getDayOfWeekAbbr('2026-09-08T22:30:00Z')).toBe('Tue');
      expect(getDayOfWeekAbbr('2026-09-09T03:30:00+09:00')).toBe('Wed');
    });

    it('returns empty string for invalid date strings or non-existent dates', () => {
      expect(getDayOfWeekAbbr('')).toBe('');
      expect(getDayOfWeekAbbr('invalid-date')).toBe('');
      expect(getDayOfWeekAbbr('2026-02-31')).toBe(''); // Non-existent date
    });
  });

  describe('formatShortDate', () => {
    it('formats YYYY-MM-DD into "Month Day"', () => {
      expect(formatShortDate('2026-09-08')).toBe('Sep 8');
      expect(formatShortDate('2026-01-01')).toBe('Jan 1');
      expect(formatShortDate('2026-12-31')).toBe('Dec 31');
    });

    it('formats ISO timestamps via normalization', () => {
      expect(formatShortDate('2026-09-08T00:00:00+00:00')).toBe('Sep 8');
      expect(formatShortDate('2026-09-08T23:59:59Z')).toBe('Sep 8');
    });

    it('returns empty string for empty or non-string input', () => {
      expect(formatShortDate('')).toBe('');
      expect(formatShortDate(null as any)).toBe('');
      expect(formatShortDate(undefined as any)).toBe('');
    });

    it('returns unformatted string if splitting does not yield 3 parts', () => {
      expect(formatShortDate('invalid')).toBe('invalid');
    });
  });

  describe('formatLocalTimestamp', () => {
    it('generates ISO timestamp anchored to calendarDate and local time', () => {
      const time = new Date(2026, 8, 8, 20, 31, 45); // 20:31:45
      const ts = formatLocalTimestamp('2026-09-08', time);
      expect(ts).toBe('2026-09-08T20:31:45Z');
      expect(normalizeDateStr(ts)).toBe('2026-09-08');
    });

    it('zero-pads hours, minutes, seconds', () => {
      const time = new Date(2026, 8, 8, 8, 5, 9); // 08:05:09
      const ts = formatLocalTimestamp('2026-09-08', time);
      expect(ts).toBe('2026-09-08T08:05:09Z');
    });

    it('falls back to getLocalDateStr(time) when calendarDate is missing or null', () => {
      const time = new Date(2026, 8, 8, 14, 20, 10);
      expect(formatLocalTimestamp(null, time)).toBe('2026-09-08T14:20:10Z');
      expect(formatLocalTimestamp(undefined, time)).toBe('2026-09-08T14:20:10Z');
      expect(formatLocalTimestamp('', time)).toBe('2026-09-08T14:20:10Z');
    });

    it('falls back to getLocalDateStr(time) when calendarDate is malformed', () => {
      const time = new Date(2026, 8, 8, 14, 20, 10);
      expect(formatLocalTimestamp('invalid-date', time)).toBe('2026-09-08T14:20:10Z');
      expect(formatLocalTimestamp('2026/09/08', time)).toBe('2026-09-08T14:20:10Z');
    });

    it('defaults to current system time if time parameter is omitted', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 8, 19, 40, 30));
      expect(formatLocalTimestamp('2026-09-08')).toBe('2026-09-08T19:40:30Z');
    });

    it('gracefully handles invalid Date object passed as time parameter without throwing or outputting NaN', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 8, 18, 0, 0));
      const invalidDate = new Date('invalid');
      const ts = formatLocalTimestamp('2026-09-08', invalidDate);
      expect(ts).toBe('2026-09-08T18:00:00Z');
      expect(ts).not.toContain('NaN');
    });
  });
});
