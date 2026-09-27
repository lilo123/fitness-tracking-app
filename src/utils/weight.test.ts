import { describe, it, expect } from 'vitest';
import {
  formatWeight,
  formatSet,
  parseWeightInput,
  lbToKg,
  kgToLb,
  convertWeight,
} from './weight';

describe('weight utilities (src/utils/weight.ts)', () => {
  describe('lb <-> kg math (RD-1)', () => {
    it('converts lb to kg accurately', () => {
      expect(lbToKg(220.462)).toBeCloseTo(100, 1);
      expect(lbToKg(0)).toBe(0);
    });

    it('converts kg to lb accurately', () => {
      expect(kgToLb(100)).toBeCloseTo(220.462, 1);
      expect(kgToLb(0)).toBe(0);
    });

    it('convertWeight converts between units with rounding to 0.5', () => {
      expect(convertWeight(100, 'lb', 'kg')).toBe(45.5);
      expect(convertWeight(45.5, 'kg', 'lb')).toBe(100.5);
      expect(convertWeight(100, 'lb', 'lb')).toBe(100);
      expect(convertWeight(50, 'kg', 'kg')).toBe(50);
    });
  });

  describe('formatWeight (W7, RD-1, STD-DAT-1)', () => {
    it('formats 0 or null as BW by default', () => {
      expect(formatWeight(0)).toBe('BW');
      expect(formatWeight(null)).toBe('BW');
      expect(formatWeight(undefined)).toBe('BW');
    });

    it('formats positive weight in lb', () => {
      expect(formatWeight(100, 'lb')).toBe('100');
      expect(formatWeight(100.5, 'lb')).toBe('100.5');
    });

    it('formats weight in kg with 0.5 rounding', () => {
      expect(formatWeight(220.462, 'kg')).toBe('100');
      expect(formatWeight(100, 'kg')).toBe('45.5');
    });

    it('appends unit when showUnit is true', () => {
      expect(formatWeight(100, 'lb', { showUnit: true })).toBe('100 lbs');
      expect(formatWeight(100, 'kg', { showUnit: true })).toBe('45.5 kg');
      expect(formatWeight(0, 'lb', { showUnit: true })).toBe('BW');
    });
  });

  describe('formatSet (W7, RD-1, STD-DAT-1)', () => {
    it('formats standard weight and reps using multiplication sign ×', () => {
      expect(formatSet(100, 8)).toBe('100×8');
      expect(formatSet(185, 5)).toBe('185×5');
    });

    it('formats 0 lbs / bodyweight as BW×reps consistently', () => {
      expect(formatSet(0, 8)).toBe('BW×8');
      expect(formatSet(null, 10)).toBe('BW×10');
      expect(formatSet(undefined, 6)).toBe('BW×6');
    });

    it('formats kg sets correctly', () => {
      expect(formatSet(220.462, 8, 'kg')).toBe('100×8');
      expect(formatSet(0, 8, 'kg')).toBe('BW×8');
    });

    it('handles missing reps gracefully', () => {
      expect(formatSet(100, null)).toBe('100');
      expect(formatSet(0, null)).toBe('BW');
    });
  });

  describe('parseWeightInput (RD-1)', () => {
    it('parses numeric strings in lb', () => {
      expect(parseWeightInput('135')).toBe(135);
      expect(parseWeightInput('135.5')).toBe(135.5);
    });

    it('parses BW / bw / 0 as 0', () => {
      expect(parseWeightInput('BW')).toBe(0);
      expect(parseWeightInput('bw')).toBe(0);
      expect(parseWeightInput('0')).toBe(0);
    });

    it('parses kg input and converts to canonical lb', () => {
      const canonicalLb = parseWeightInput('100', 'kg');
      expect(canonicalLb).toBeCloseTo(220.462, 1);
    });

    it('returns null for invalid inputs', () => {
      expect(parseWeightInput('')).toBeNull();
      expect(parseWeightInput('abc')).toBeNull();
      expect(parseWeightInput('-5')).toBeNull();
    });
  });
});
