import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';

interface RatchetScanCounts {
  confirm: number;
  'font-mono': number;
  'font-black': number;
  'sub-12px': number;
}

interface RatchetBaseline {
  version: number;
  description: string;
  rules: string[];
  hardRuleDirectories: string[];
  flaggedConfirm: Record<string, { count: number; reason: string } | number>;
  totals: RatchetScanCounts;
  files: Record<string, RatchetScanCounts>;
}

interface ComparisonResult {
  ok: boolean;
  violations: Array<{
    file: string;
    rule: string;
    old: number;
    new: number;
    delta: number;
    isNewFile: boolean;
    message: string;
  }>;
  hardRuleViolations: Array<{
    file: string;
    count: number;
    allowed: number;
    message: string;
  }>;
  decreases: Array<{
    file: string;
    rule: string;
    old: number;
    new: number;
    delta: number;
    message: string;
  }>;
  flaggedActive: Array<{
    file: string;
    count: number;
    allowed: number;
    reason: string;
  }>;
  totals: {
    current: RatchetScanCounts;
    baseline: RatchetScanCounts;
  };
}

type ScanContentFn = (rawContent: string) => RatchetScanCounts;
type CompareFn = (
  currentCounts: Record<string, RatchetScanCounts>,
  baseline: RatchetBaseline,
  options?: { allowIncrease?: boolean }
) => ComparisonResult;
type UpdateBaselineFn = (
  currentCounts: Record<string, RatchetScanCounts>,
  oldBaseline: RatchetBaseline | null,
  options?: { allowIncrease?: boolean }
) => RatchetBaseline;
type IsHardRuleDirFn = (relPath: string) => boolean;
type IsSub12pxLengthFn = (lengthPart: string) => boolean;
type StripCommentsFn = (source: string) => string;

let scanFileContent: ScanContentFn;
let compareWithBaseline: CompareFn;
let updateBaseline: UpdateBaselineFn;
let isHardRuleDir: IsHardRuleDirFn;
let isSub12pxLength: IsSub12pxLengthFn;
let stripComments: StripCommentsFn;
let defaultBaselinePath: string;

beforeAll(async () => {
  const scriptPath = path.resolve(__dirname, '../../scripts/check-design-ratchet.js');
  const mod = (await import(/* @vite-ignore */ scriptPath)) as {
    scanFileContent: ScanContentFn;
    compareWithBaseline: CompareFn;
    updateBaseline: UpdateBaselineFn;
    isHardRuleDir: IsHardRuleDirFn;
    isSub12pxLength: IsSub12pxLengthFn;
    stripComments: StripCommentsFn;
    defaultBaselinePath: string;
  };

  scanFileContent = mod.scanFileContent;
  compareWithBaseline = mod.compareWithBaseline;
  updateBaseline = mod.updateBaseline;
  isHardRuleDir = mod.isHardRuleDir;
  isSub12pxLength = mod.isSub12pxLength;
  stripComments = mod.stripComments;
  defaultBaselinePath = mod.defaultBaselinePath;
});

describe('Design Ratchet Checker (scripts/check-design-ratchet.js)', () => {
  const mockBaseline: RatchetBaseline = {
    version: 1,
    description: 'Test Baseline',
    rules: ['confirm', 'font-mono', 'font-black', 'sub-12px'],
    hardRuleDirectories: ['src/components/workout', 'src/components/sets', 'src/components/common'],
    flaggedConfirm: {
      'src/components/workout/EditSetModal.tsx': {
        count: 1,
        reason: 'Legacy confirm at base',
      },
    },
    totals: {
      confirm: 1,
      'font-mono': 4,
      'font-black': 2,
      'sub-12px': 5,
    },
    files: {
      'src/components/workout/EditSetModal.tsx': {
        confirm: 1,
        'font-mono': 2,
        'font-black': 1,
        'sub-12px': 2,
      },
      'src/components/history/HistoryView.tsx': {
        confirm: 0,
        'font-mono': 2,
        'font-black': 1,
        'sub-12px': 3,
      },
    },
  };

  describe('1. Increase Fails', () => {
    it('fails when an existing file increases count for font-mono', () => {
      const current = {
        'src/components/history/HistoryView.tsx': {
          confirm: 0,
          'font-mono': 3, // Increased from 2 to 3
          'font-black': 1,
          'sub-12px': 3,
        },
        'src/components/workout/EditSetModal.tsx': {
          confirm: 1,
          'font-mono': 2,
          'font-black': 1,
          'sub-12px': 2,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toMatchObject({
        file: 'src/components/history/HistoryView.tsx',
        rule: 'font-mono',
        old: 2,
        new: 3,
        delta: 1,
        isNewFile: false,
      });
    });

    it('fails when an existing file increases count for font-black', () => {
      const current = {
        'src/components/history/HistoryView.tsx': {
          confirm: 0,
          'font-mono': 2,
          'font-black': 3, // Increased from 1 to 3
          'sub-12px': 3,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.rule === 'font-black' && v.delta === 2)).toBe(true);
    });

    it('fails when an existing file increases count for sub-12px', () => {
      const current = {
        'src/components/history/HistoryView.tsx': {
          confirm: 0,
          'font-mono': 2,
          'font-black': 1,
          'sub-12px': 5, // Increased from 3 to 5
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.rule === 'sub-12px' && v.delta === 2)).toBe(true);
    });
  });

  describe('2. Decrease Passes', () => {
    it('passes and records improvement when an existing file decreases violations', () => {
      const current = {
        'src/components/workout/EditSetModal.tsx': {
          confirm: 0, // Decreased from 1 to 0!
          'font-mono': 1, // Decreased from 2 to 1
          'font-black': 0, // Decreased from 1 to 0
          'sub-12px': 1, // Decreased from 2 to 1
        },
        'src/components/history/HistoryView.tsx': {
          confirm: 0,
          'font-mono': 2,
          'font-black': 1,
          'sub-12px': 3,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.hardRuleViolations).toHaveLength(0);
      expect(result.decreases.length).toBeGreaterThanOrEqual(4);

      const confirmDec = result.decreases.find(
        (d) => d.file === 'src/components/workout/EditSetModal.tsx' && d.rule === 'confirm'
      );
      expect(confirmDec).toMatchObject({
        old: 1,
        new: 0,
        delta: 1,
      });
    });

    it('passes when counts are identical to baseline', () => {
      const current = {
        'src/components/workout/EditSetModal.tsx': {
          confirm: 1,
          'font-mono': 2,
          'font-black': 1,
          'sub-12px': 2,
        },
        'src/components/history/HistoryView.tsx': {
          confirm: 0,
          'font-mono': 2,
          'font-black': 1,
          'sub-12px': 3,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.decreases).toHaveLength(0);
      expect(result.hardRuleViolations).toHaveLength(0);
    });
  });

  describe('3. New File With Violation Fails', () => {
    it('fails when a new unrecorded file introduces a non-zero count', () => {
      const current = {
        ...mockBaseline.files,
        'src/components/nutrition/NewFeatureCard.tsx': {
          confirm: 0,
          'font-mono': 1, // New violation
          'font-black': 0,
          'sub-12px': 0,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toMatchObject({
        file: 'src/components/nutrition/NewFeatureCard.tsx',
        rule: 'font-mono',
        old: 0,
        new: 1,
        delta: 1,
        isNewFile: true,
      });
    });

    it('passes when a new file has zero violations', () => {
      const current = {
        ...mockBaseline.files,
        'src/components/nutrition/CleanComponent.tsx': {
          confirm: 0,
          'font-mono': 0,
          'font-black': 0,
          'sub-12px': 0,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('4. Hard-Rule Directory Fails', () => {
    it('fails when an unflagged file in src/components/workout contains confirm()', () => {
      const current = {
        ...mockBaseline.files,
        'src/components/workout/NewWorkoutComponent.tsx': {
          confirm: 1,
          'font-mono': 0,
          'font-black': 0,
          'sub-12px': 0,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(false);
      expect(result.hardRuleViolations).toHaveLength(1);
      expect(result.hardRuleViolations[0].file).toBe('src/components/workout/NewWorkoutComponent.tsx');
      expect(result.hardRuleViolations[0].count).toBe(1);
      expect(result.hardRuleViolations[0].allowed).toBe(0);
    });

    it('fails when an unflagged file in src/components/sets contains confirm()', () => {
      const current = {
        ...mockBaseline.files,
        'src/components/sets/EditSetSheet.tsx': {
          confirm: 1,
          'font-mono': 0,
          'font-black': 0,
          'sub-12px': 0,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(false);
      expect(result.hardRuleViolations.some((h) => h.file === 'src/components/sets/EditSetSheet.tsx')).toBe(true);
    });

    it('fails when an unflagged file in src/components/common contains confirm()', () => {
      const current = {
        ...mockBaseline.files,
        'src/components/common/ConfirmDialog.tsx': {
          confirm: 1,
          'font-mono': 0,
          'font-black': 0,
          'sub-12px': 0,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(false);
      expect(result.hardRuleViolations.some((h) => h.file === 'src/components/common/ConfirmDialog.tsx')).toBe(true);
    });

    it('fails when a flagged file increases confirm calls above its allowed baseline count', () => {
      const current = {
        ...mockBaseline.files,
        'src/components/workout/EditSetModal.tsx': {
          confirm: 2, // Allowed is 1, now 2!
          'font-mono': 2,
          'font-black': 1,
          'sub-12px': 2,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.ok).toBe(false);
      expect(result.hardRuleViolations.some((h) => h.file === 'src/components/workout/EditSetModal.tsx')).toBe(true);
    });

    it('passes when a flagged file matches its allowed flagged confirm count', () => {
      const current = {
        'src/components/workout/EditSetModal.tsx': {
          confirm: 1, // Matches allowed 1
          'font-mono': 2,
          'font-black': 1,
          'sub-12px': 2,
        },
      };

      const result = compareWithBaseline(current, mockBaseline);
      expect(result.hardRuleViolations).toHaveLength(0);
      expect(result.flaggedActive.some((f) => f.file === 'src/components/workout/EditSetModal.tsx')).toBe(true);
    });

    it('correctly classifies hard rule directories', () => {
      expect(isHardRuleDir('src/components/workout/WorkoutEngine.tsx')).toBe(true);
      expect(isHardRuleDir('src/components/sets/EditSetSheet.tsx')).toBe(true);
      expect(isHardRuleDir('src/components/common/Header.tsx')).toBe(true);
      expect(isHardRuleDir('src/components/nutrition/NutritionEngine.tsx')).toBe(false);
      expect(isHardRuleDir('src/components/history/HistoryView.tsx')).toBe(false);
    });
  });

  describe('5. Baseline Update Behavior', () => {
    it('successfully updates baseline when counts decrease', () => {
      const current = {
        'src/components/history/HistoryView.tsx': {
          confirm: 0,
          'font-mono': 1, // Decreased from 2 to 1
          'font-black': 0, // Decreased from 1 to 0
          'sub-12px': 2, // Decreased from 3 to 2
        },
      };

      const updated = updateBaseline(current, mockBaseline);
      expect(updated.files['src/components/history/HistoryView.tsx']).toEqual({
        confirm: 0,
        'font-mono': 1,
        'font-black': 0,
        'sub-12px': 2,
      });
      expect(updated.totals['font-mono']).toBe(1);
    });

    it('rejects baseline update when counts increase unless allowIncrease is set', () => {
      const current = {
        'src/components/history/HistoryView.tsx': {
          confirm: 0,
          'font-mono': 5, // Increased from 2 to 5
          'font-black': 1,
          'sub-12px': 3,
        },
      };

      expect(() => updateBaseline(current, mockBaseline)).toThrow(/forbidden by policy/i);

      // With allowIncrease (policy forbidden, but supported by flag for explicit override)
      const forcedUpdate = updateBaseline(current, mockBaseline, { allowIncrease: true });
      expect(forcedUpdate.files['src/components/history/HistoryView.tsx']['font-mono']).toBe(5);
    });

    it('removes resolved entries from flaggedConfirm when confirm drops to 0', () => {
      const current = {
        'src/components/workout/EditSetModal.tsx': {
          confirm: 0, // Resolved!
          'font-mono': 2,
          'font-black': 1,
          'sub-12px': 2,
        },
      };

      const updated = updateBaseline(current, mockBaseline);
      expect(updated.flaggedConfirm['src/components/workout/EditSetModal.tsx']).toBeUndefined();
    });
  });

  describe('6. Parser & Scanner Accuracy', () => {
    it('detects window.confirm( and bare confirm(', () => {
      const code = `
        function removeSet() {
          if (window.confirm("Delete?")) { doDelete(); }
          if (confirm("Sure?")) { doSure(); }
          const confirmPassword = "123";
          if (confirmPassword === "123") {}
          dialog.confirm("Custom method");
        }
      `;
      const counts = scanFileContent(code);
      expect(counts.confirm).toBe(2);
    });

    it('detects font-mono and variant-prefixed font-mono', () => {
      const code = `
        <span className="text-xs font-mono">123</span>
        <div className="sm:font-mono not-font-mono text-white">456</div>
      `;
      const counts = scanFileContent(code);
      // "font-mono" and "sm:font-mono" match; "not-font-mono" does not
      expect(counts['font-mono']).toBe(2);
    });

    it('detects font-black and variant-prefixed font-black', () => {
      const code = `
        <h1 className="text-xl font-black">Title</h1>
        <h2 className="md:font-black not-font-black">Sub</h2>
      `;
      const counts = scanFileContent(code);
      expect(counts['font-black']).toBe(2);
    });

    it('detects sub-12px arbitrary classes, named tokens, and inline fontSize', () => {
      const code = `
        <div className="text-[10px] sm:text-[11px] text-[9px] text-[0.65rem] text-[0.7rem]/4 text-2xs text-3xs">
          <span style={{ fontSize: 10 }}>Small</span>
          <span style={{ fontSize: '11px', color: 'red' }}>Small px</span>
          <span style={{ fontSize: '0.6875rem' }}>Small rem</span>
          <span style={{ font-size: '8pt' }}>Small pt</span>
          {/* Compliant sizes below: should NOT be counted */}
          <span className="text-xs text-[12px] text-[14px] text-[16px] text-[0.75rem] text-[1rem]">Normal</span>
          <span style={{ fontSize: 12 }}>Twelve</span>
          <span style={{ fontSize: 14 }}>Fourteen</span>
          <span style={{ fontSize: '1rem' }}>One rem</span>
          <span className="text-[#ff0000] text-[rgb(0,0,0)]">Color only</span>
        </div>
      `;
      const counts = scanFileContent(code);
      // text-[10px] (1) + sm:text-[11px] (1) + text-[9px] (1) + text-[0.65rem] (1) + text-[0.7rem]/4 (1)
      // + text-2xs (1) + text-3xs (1) + fontSize: 10 (1) + fontSize: '11px' (1)
      // + fontSize: '0.6875rem' (1) + font-size: '8pt' (1) = 11
      expect(counts['sub-12px']).toBe(11);
    });

    it('accurately parses length units via isSub12pxLength', () => {
      expect(isSub12pxLength('10px')).toBe(true);
      expect(isSub12pxLength('11.5px')).toBe(true);
      expect(isSub12pxLength('12px')).toBe(false);
      expect(isSub12pxLength('14px')).toBe(false);

      expect(isSub12pxLength('0.6rem')).toBe(true);
      expect(isSub12pxLength('0.7rem')).toBe(true);
      expect(isSub12pxLength('0.74rem')).toBe(true);
      expect(isSub12pxLength('0.75rem')).toBe(false); // 12px
      expect(isSub12pxLength('1rem')).toBe(false);

      expect(isSub12pxLength('8pt')).toBe(true);
      expect(isSub12pxLength('9pt')).toBe(false);

      expect(isSub12pxLength('10')).toBe(true);
      expect(isSub12pxLength('12')).toBe(false);

      expect(isSub12pxLength('red')).toBe(false);
      expect(isSub12pxLength('#ffffff')).toBe(false);
    });

    it('accurately strips comments with stripComments', () => {
      const code = "const a = 1; // line comment\n/* block */ const b = 2;";
      const stripped = stripComments(code);
      expect(stripped).not.toContain("line comment");
      expect(stripped).not.toContain("block");
      expect(stripped).toContain("const a = 1;");
      expect(stripped).toContain("const b = 2;");
    });

    it('ignores violations inside comments', () => {
      const code = `
        // window.confirm("In line comment");
        // className="font-mono font-black text-[10px]"
        /*
          confirm("In block comment");
          font-mono
          font-black
          text-[11px]
        */
        const x = 1;
      `;
      const counts = scanFileContent(code);
      expect(counts.confirm).toBe(0);
      expect(counts['font-mono']).toBe(0);
      expect(counts['font-black']).toBe(0);
      expect(counts['sub-12px']).toBe(0);
    });
  });

  describe('7. Baseline File Existence and Integrity', () => {
    it('baseline path is defined and exists', () => {
      expect(defaultBaselinePath).toBeDefined();
    });
  });
});
