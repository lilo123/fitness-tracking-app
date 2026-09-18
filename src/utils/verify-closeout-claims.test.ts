import { describe, it, expect, beforeAll } from 'vitest';

interface Claim {
  id: string;
  description: string;
  claimedValue: string;
  source: string;
  type: string;
  formula?: string;
  context?: string;
  lineNumber?: number;
}

interface VerificationRow {
  id: string;
  description: string;
  claimed: string;
  extracted: string | null;
  match: boolean;
  type: string;
  source: string;
  error: string | null;
  isDecayed?: boolean;
}

interface UnhandledFigure {
  lineNumber: number;
  figure: string;
  line: string;
}

interface SweepResult {
  passed: boolean;
  unhandledFigures: UnhandledFigure[];
}

interface VerificationReport {
  passed: boolean;
  error?: string;
  results: VerificationRow[];
  sweep?: SweepResult;
}

type ParseClaimsFn = (markdown: string) => Claim[];
type NormalizeValueFn = (val: unknown) => string;
type EvaluateFormulaFn = (formula: string, resolvedMetrics: Record<string, string>) => number;
type ExtractMetricFn = (
  metricId: string,
  sourceFileName: string,
  evidenceDir: string | Record<string, unknown>,
  context?: string,
  manifest?: unknown
) => string;
type SweepUnaccountedFiguresFn = (
  markdown: string,
  verifiedResults?: unknown[],
  manifest?: unknown
) => SweepResult;
type VerifyCloseoutClaimsFn = (
  markdownContent: string,
  evidenceDir?: string | Record<string, unknown>
) => VerificationReport;

let parseClaims: ParseClaimsFn;
let normalizeValue: NormalizeValueFn;
let evaluateFormula: EvaluateFormulaFn;
let extractMetricFromEvidence: ExtractMetricFn;
let sweepUnaccountedFigures: SweepUnaccountedFiguresFn;
let verifyCloseoutClaims: VerifyCloseoutClaimsFn;

beforeAll(async () => {
  const scriptPath = '../../scripts/verify-closeout-claims.js';
  const mod = (await import(/* @vite-ignore */ scriptPath)) as unknown as {
    parseClaims: ParseClaimsFn;
    normalizeValue: NormalizeValueFn;
    evaluateFormula: EvaluateFormulaFn;
    extractMetricFromEvidence: ExtractMetricFn;
    sweepUnaccountedFigures: SweepUnaccountedFiguresFn;
    verifyCloseoutClaims: VerifyCloseoutClaimsFn;
  };
  parseClaims = mod.parseClaims;
  normalizeValue = mod.normalizeValue;
  evaluateFormula = mod.evaluateFormula;
  extractMetricFromEvidence = mod.extractMetricFromEvidence;
  sweepUnaccountedFigures = mod.sweepUnaccountedFigures;
  verifyCloseoutClaims = mod.verifyCloseoutClaims;
});

describe('verify-closeout-claims', () => {
  describe('normalizeValue', () => {
    it('normalizes numbers with byte units and commas', () => {
      expect(normalizeValue('123,085 B')).toBe('123085');
      expect(normalizeValue('95,311 bytes')).toBe('95311');
      expect(normalizeValue('2,269 B')).toBe('2269');
      expect(normalizeValue('682 B')).toBe('682');
    });

    it('normalizes ratios and percentages', () => {
      expect(normalizeValue('47 / 47')).toBe('47/47');
      expect(normalizeValue('100%')).toBe('100%');
      expect(normalizeValue('99.5%')).toBe('99.5%');
    });

    it('preserves uppercase status keywords', () => {
      expect(normalizeValue('PASS')).toBe('PASS');
      expect(normalizeValue('ZERO RESIDUE')).toBe('ZERO RESIDUE');
      expect(normalizeValue('0')).toBe('0');
      expect(normalizeValue('1')).toBe('1');
    });
  });

  describe('parseClaims', () => {
    it('parses claims from markdown tables', () => {
      const markdown = `
# Summary
| Metric ID | Description | Claimed Value | Evidence Source | Type | Context / Formula |
| :--- | :--- | :--- | :--- | :--- | :--- |
| gate_tsc_exit | TypeScript Compiler Exit Code | 0 | tsc.txt | measured | exit_code |
| gate_vitest_tests | Vitest Tests Passed | 697 | vitest.txt | measured | passed_count |
| route_payload_workout | Workout Route Payload | 123,085 B | perf-trace-results.json | measured | totalBytes |
`;
      const claims = parseClaims(markdown);
      expect(claims).toHaveLength(3);
      expect(claims[0]).toMatchObject({
        id: 'gate_tsc_exit',
        claimedValue: '0',
        source: 'tsc.txt',
        type: 'measured',
      });
      expect(claims[1]).toMatchObject({
        id: 'gate_vitest_tests',
        claimedValue: '697',
        source: 'vitest.txt',
        type: 'measured',
      });
      expect(claims[2]).toMatchObject({
        id: 'route_payload_workout',
        claimedValue: '123,085 B',
        source: 'perf-trace-results.json',
        type: 'measured',
      });
    });

    it('parses claims from HTML comment tags', () => {
      const markdown = `
Some intro text.
<!-- claim: id="gate_tsc_exit" value="0" source="tsc.txt" type="measured" desc="TSC Exit" -->
<!-- claim: id="combined_payload" value="125,354 B" source="derived" type="derived" formula="a + b" -->
`;
      const claims = parseClaims(markdown);
      expect(claims).toHaveLength(2);
      expect(claims[0]).toMatchObject({
        id: 'gate_tsc_exit',
        claimedValue: '0',
        source: 'tsc.txt',
        type: 'measured',
      });
      expect(claims[1]).toMatchObject({
        id: 'combined_payload',
        claimedValue: '125,354 B',
        type: 'derived',
        formula: 'a + b',
      });
    });

    it('ignores non-matching tables and malformed rows', () => {
      const markdown = `
| Random | Header |
| --- | --- |
| foo | bar |
`;
      const claims = parseClaims(markdown);
      expect(claims).toHaveLength(0);
    });
  });

  describe('evaluateFormula', () => {
    it('evaluates basic addition of resolved metrics', () => {
      const resolved = {
        route_workout: '123085',
        route_nutrition: '2269',
      };
      const result = evaluateFormula('route_workout + route_nutrition', resolved);
      expect(result).toBe(125354);
    });

    it('evaluates multi-metric formulas with groupings', () => {
      const resolved = {
        m1: '100',
        m2: '50',
        m3: '25',
      };
      const result = evaluateFormula('(m1 + m2) - m3', resolved);
      expect(result).toBe(125);
    });

    it('throws when formula references an unknown metric', () => {
      const resolved = { m1: '100' };
      expect(() => evaluateFormula('m1 + unknown_metric', resolved)).toThrow(
        /unknown or unresolved metric/,
      );
    });

    it('throws when formula contains unauthorized characters or syntax', () => {
      const resolved = { m1: '100' };
      expect(() => evaluateFormula('m1; invalidCode', resolved)).toThrow();
    });
  });

  describe('Metric Binding vs Bare-String Search (NC-2 Oracle)', () => {
    it('binds metric ID strictly to its specific route payload', () => {
      const fixtureEvidence: Record<string, unknown> = {
        'perf-trace-results.json': {
          routes: {
            '/workout': { totalBytes: 123085, queries: [{ table: 'routine_templates', bytes: 95311 }] },
            '/history': { totalBytes: 26930, queries: [] },
            '/nutrition': { totalBytes: 2269, queries: [] },
            '/coach': { totalBytes: 57422, queries: [{ table: 'routine_templates', bytes: 682, description: 'workouts' }] },
          },
        },
      };

      // Correct binding: nutrition is 2269
      const nutritionVal = extractMetricFromEvidence(
        'route_payload_nutrition',
        'perf-trace-results.json',
        fixtureEvidence,
      );
      expect(nutritionVal).toBe('2269');

      // Correct binding: history is 26930
      const historyVal = extractMetricFromEvidence(
        'route_payload_history',
        'perf-trace-results.json',
        fixtureEvidence,
      );
      expect(historyVal).toBe('26930');

      // Negative Control NC-2: If someone claims nutrition is 26,930 B (the history number)
      const claimWithCrossMetricSwap = `
| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| route_payload_nutrition | Route /nutrition Total Payload | 26,930 B | perf-trace-results.json | measured | totalBytes |
`;
      const result = verifyCloseoutClaims(claimWithCrossMetricSwap, fixtureEvidence);
      expect(result.passed).toBe(false);
      expect(result.results[0].match).toBe(false);
      expect(result.results[0].extracted).toBe('2269');
      expect(result.results[0].claimed).toBe('26,930 B');
    });
  });

  describe('Anti-Decay Detection (NC-4 Oracle)', () => {
    it('rejects stale / pre-fix route query payloads and flags decay', () => {
      const fixtureEvidence: Record<string, unknown> = {
        'perf-trace-results.json': {
          routes: {
            '/workout': {
              totalBytes: 123085,
              queries: [
                { table: 'routine_templates', bytes: 95311, select: 'id,user_id,name' },
                { table: 'exercises', bytes: 27774 },
              ],
            },
          },
        },
      };

      // Decayed claim: 122,311 B was the pre-fix payload before projection was narrowed
      const decayedClaim = `
| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| route_payload_workout_query | Route /workout Workouts Query | 122,311 B | perf-trace-results.json | measured | routine_templates |
`;
      const result = verifyCloseoutClaims(decayedClaim, fixtureEvidence);
      expect(result.passed).toBe(false);
      expect(result.results[0].match).toBe(false);
      expect(result.results[0].isDecayed).toBe(true);
      expect(result.results[0].extracted).toBe('95311');

      // Valid current claim: 95,311 B
      const validClaim = `
| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| route_payload_workout_query | Route /workout Workouts Query | 95,311 B | perf-trace-results.json | measured | routine_templates |
`;
      const validResult = verifyCloseoutClaims(validClaim, fixtureEvidence);
      expect(validResult.passed).toBe(true);
      expect(validResult.results[0].match).toBe(true);
    });
  });

  describe('Derived vs Measured Arithmetic Discrepancy (NC-3 Oracle)', () => {
    it('rejects derived figures with incorrect arithmetic', () => {
      const fixtureEvidence: Record<string, unknown> = {
        'perf-trace-results.json': {
          routes: {
            '/workout': { totalBytes: 123085, queries: [] },
            '/nutrition': { totalBytes: 2269, queries: [] },
          },
        },
      };

      // False claim: 123,085 + 2,269 = 125,354, but claimed is 130,000 B
      const badArithmeticDoc = `
| Metric ID | Description | Claimed Value | Evidence Source | Type | Context / Formula |
| :--- | :--- | :--- | :--- | :--- | :--- |
| route_payload_workout_total | Workout | 123,085 B | perf-trace-results.json | measured | totalBytes |
| route_payload_nutrition | Nutrition | 2,269 B | perf-trace-results.json | measured | totalBytes |
| route_payload_combined | Combined | 130,000 B | derived | derived | route_payload_workout_total + route_payload_nutrition |
`;
      const result = verifyCloseoutClaims(badArithmeticDoc, fixtureEvidence);
      expect(result.passed).toBe(false);
      const derivedRow = result.results.find((r: VerificationRow) => r.id === 'route_payload_combined');
      expect(derivedRow?.match).toBe(false);
      expect(derivedRow?.extracted).toBe('125354');
      expect(derivedRow?.claimed).toBe('130,000 B');
    });

    it('rejects derived figures referencing nonexistent metric inputs', () => {
      const emptyEvidence: Record<string, unknown> = {};

      const missingInputDoc = `
| Metric ID | Description | Claimed Value | Evidence Source | Type | Context / Formula |
| :--- | :--- | :--- | :--- | :--- | :--- |
| route_payload_combined | Combined | 125,354 B | derived | derived | non_existent_metric + 10 |
`;
      const result = verifyCloseoutClaims(missingInputDoc, emptyEvidence);
      expect(result.passed).toBe(false);
      expect(result.results[0].error).toMatch(/unknown or unresolved metric/);
    });
  });

  describe('Manifest Checksum Integrity', () => {
    it('rejects tampered or corrupted evidence files', () => {
      const tamperedEvidence: Record<string, unknown> = {
        'tsc.txt': 'tsc output\n',
        'manifest.json': {
          gitCommit: 'fakecommit',
          dirty: false,
          artifacts: {
            'tsc.txt': {
              command: 'npx tsc',
              exitCode: 0,
              sha256: '0000000000000000000000000000000000000000000000000000000000000000', // Mismatch
            },
          },
        },
      };

      const doc = `
| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| gate_tsc_exit | TSC | 0 | tsc.txt | measured | exit_code |
`;
      const result = verifyCloseoutClaims(doc, tamperedEvidence);
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/Manifest integrity failure/);
      expect(result.error).toMatch(/SHA256 mismatch/);
    });
  });

  describe('Unaccounted-Figure Sweep (NC-5 / NC-6 Oracle)', () => {
    it('fails and names both invented figures and line numbers when unverified prose is appended (NC-5)', () => {
      const markdown = `
# CyberGym Tier 3 Closeout Verification Report

| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| gate_tsc_exit | TypeScript Compiler | 0 | tsc.txt | measured | |

## Appendix
The /workout route now transfers 999999 B and the react-vendor chunk is 172129 B.
`;
      const sweep = sweepUnaccountedFigures(markdown, [{ claimed: '0', extracted: '0' }]);
      expect(sweep.passed).toBe(false);
      expect(sweep.unhandledFigures).toHaveLength(2);
      expect(sweep.unhandledFigures[0]).toMatchObject({
        lineNumber: 9,
        figure: '999999',
      });
      expect(sweep.unhandledFigures[1]).toMatchObject({
        lineNumber: 9,
        figure: '172129',
      });
    });

    it('still sees figures adjacent to hyphenated words, while ignoring real work-item ids', () => {
      // Regression guard. The identifier ignore rule was once broad enough
      // (`[A-Za-z]+-[A-Za-z0-9_]+` / `[A-Za-z0-9_]+-[A-Za-z]+`) that it deleted
      // the figure along with the word: `999999-byte` and `pre-888888` both
      // vanished from the sweep entirely. That is indistinguishable from having
      // no sweep at all for anyone who writes naturally, so pin it.
      const markdown = `
# CyberGym Tier 3 Closeout Verification Report

| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| gate_tsc_exit | TypeScript Compiler | 0 | tsc.txt | measured | |

## Appendix
RFIX-24 and W-10 and P3-0 are identifiers, but this is a 999999-byte payload.
A separate pre-888888 baseline was also recorded.
`;
      const sweep = sweepUnaccountedFigures(markdown, [{ claimed: '0', extracted: '0' }]);
      expect(sweep.passed).toBe(false);

      const figures = sweep.unhandledFigures.map((f) => f.figure);
      expect(figures).toContain('999999');
      expect(figures).toContain('888888');

      // The genuine work-item identifiers must NOT be reported as figures.
      expect(figures).not.toContain('24');
      expect(figures).not.toContain('10');
      expect(figures).not.toContain('3');
      expect(figures).not.toContain('0');
    });

    it('allows figures explicitly waived inline with a human reason', () => {
      const markdown = `
# CyberGym Tier 3 Closeout Verification Report

| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| gate_tsc_exit | TypeScript Compiler | 0 | tsc.txt | measured | |

<!-- figure-ok: testing explicit inline waiver for legacy figure -->
The /workout route now transfers 999999 B and the react-vendor chunk is 172129 B.
`;
      const sweep = sweepUnaccountedFigures(markdown, [{ claimed: '0', extracted: '0' }]);
      expect(sweep.passed).toBe(true);
      expect(sweep.unhandledFigures).toHaveLength(0);
    });

    it('respects narrow ignore rules (ISO timestamps, git SHAs, UUIDs, section numbers, list numbers, URLs)', () => {
      const markdown = `
# CyberGym Tier 3 Closeout Verification Report

- **Commit**: \`9d2a01cbc5de20591782afbc33afe7be10b90653\`
- **Manifest Timestamp**: \`2026-09-17T16:29:02.369Z\`
- **Run ID**: \`4efb212f-3ead-4fd8-bd9a-b81e37fd9082\`
- **Docs**: https://example.com/api/v1/metrics/12345

## 1. First Section
1. First list item
2. Second list item

| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| gate_tsc_exit | TypeScript Compiler | 0 | tsc.txt | measured | |
`;
      const sweep = sweepUnaccountedFigures(markdown, [{ claimed: '0', extracted: '0' }]);
      expect(sweep.passed).toBe(true);
      expect(sweep.unhandledFigures).toHaveLength(0);
    });

    it('causes verifyCloseoutClaims to fail if an unaccounted figure is present in document', () => {
      const fixtureEvidence: Record<string, unknown> = {
        'tsc.txt': 'tsc output\n',
      };
      const badDoc = `
| Metric ID | Description | Claimed Value | Evidence Source | Type | Context |
| :--- | :--- | :--- | :--- | :--- | :--- |
| gate_tsc_exit | TSC | 0 | tsc.txt | measured | |

Invented figure: 888888
`;
      const result = verifyCloseoutClaims(badDoc, fixtureEvidence);
      expect(result.passed).toBe(false);
      expect(result.sweep?.passed).toBe(false);
      expect(result.sweep?.unhandledFigures[0].figure).toBe('888888');
    });
  });
});
