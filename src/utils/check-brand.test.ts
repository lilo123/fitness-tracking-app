import { describe, it, expect, beforeAll } from 'vitest';

interface Violation {
  path: string;
  line: number;
  text: string;
  token: string;
}

type ScanContentFn = (
  filePath: string,
  content: string,
  allowlist?: unknown[],
  matchedEntries?: Set<number> | null,
) => Violation[];

type MatchPathFn = (pattern: string, filePath: string) => boolean;
type FindForbiddenMatchFn = (lineText: string) => string | null;

let scanContent: ScanContentFn;
let matchPath: MatchPathFn;
let findForbiddenMatch: FindForbiddenMatchFn;

beforeAll(async () => {
  const scriptPath = '../../scripts/check-brand.js';
  const mod = (await import(/* @vite-ignore */ scriptPath)) as unknown as {
    scanContent: ScanContentFn;
    matchPath: MatchPathFn;
    findForbiddenMatch: FindForbiddenMatchFn;
  };
  scanContent = mod.scanContent;
  matchPath = mod.matchPath;
  findForbiddenMatch = mod.findForbiddenMatch;
});

describe('check-brand', () => {
  describe('matchPath', () => {
    it('matches exact paths', () => {
      expect(matchPath('docs/closeout.md', 'docs/closeout.md')).toBe(true);
      expect(matchPath('docs/closeout.md', 'docs/other.md')).toBe(false);
    });

    it('matches simple glob with single star (*)', () => {
      expect(
        matchPath(
          'supabase/audits/m11_coach_code_prefix_yb_*.sql',
          'supabase/audits/m11_coach_code_prefix_yb_pre.sql',
        ),
      ).toBe(true);
      expect(
        matchPath(
          'supabase/audits/m11_coach_code_prefix_yb_*.sql',
          'supabase/audits/m11_coach_code_prefix_yb_post.sql',
        ),
      ).toBe(true);
      expect(
        matchPath(
          'supabase/audits/m11_coach_code_prefix_yb_*.sql',
          'supabase/other/m11_coach_code_prefix_yb_pre.sql',
        ),
      ).toBe(false);
    });

    it('matches recursive glob with double star (**)', () => {
      expect(matchPath('docs/evidence/**', 'docs/evidence/check-mock-fidelity.txt')).toBe(true);
      expect(matchPath('docs/evidence/**', 'docs/evidence/sub/nested.txt')).toBe(true);
      expect(matchPath('docs/evidence/**', 'docs/other/check-mock-fidelity.txt')).toBe(false);
    });
  });

  describe('findForbiddenMatch', () => {
    it('detects cybergym case-insensitively', () => {
      expect(findForbiddenMatch('Welcome to cybergym!')).toBeTruthy();
      expect(findForbiddenMatch('Welcome to CyberGym!')).toBeTruthy();
      expect(findForbiddenMatch('Welcome to CYBERGYM!')).toBeTruthy();
    });

    it('detects CYBER- prefix', () => {
      expect(findForbiddenMatch('const code = "CYBER-DEMO01";')).toBeTruthy();
      expect(findForbiddenMatch('const code = "CYBER-123";')).toBeTruthy();
    });

    it('detects com.cybergym package', () => {
      expect(findForbiddenMatch('package com.cybergym.app;')).toBeTruthy();
      expect(findForbiddenMatch('com.cybergym.something')).toBeTruthy();
    });

    it('returns null on clean lines', () => {
      expect(findForbiddenMatch('const app = "Yourbody";')).toBeNull();
      expect(findForbiddenMatch('const domain = "yourbody.fyi";')).toBeNull();
      expect(findForbiddenMatch('const code = "YB-DEMO01";')).toBeNull();
    });
  });

  describe('scanContent', () => {
    it('planted violation fails in non-allowlisted file', () => {
      const content = 'const brand = "cybergym";\nexport default brand;\n';
      const violations = scanContent('src/components/Brand.tsx', content);

      expect(violations).toHaveLength(1);
      expect(violations[0].path).toBe('src/components/Brand.tsx');
      expect(violations[0].line).toBe(1);
      expect(violations[0].token.toLowerCase()).toBe('cybergym');
    });

    it('allowlisted line passes', () => {
      // Historical migration seed line
      const seedLine = "ROOT_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, 'cybergym.app') # D-YB-4 keep\n";
      const violations1 = scanContent('scripts/migrate-historical-data.py', seedLine);
      expect(violations1).toHaveLength(0);

      // Runtime names test line with allow comment
      const testLine = "expect(name).not.toContain('cybergym'); // check-brand: allow\n";
      const violations2 = scanContent('src/test/runtimeNames.test.ts', testLine);
      expect(violations2).toHaveLength(0);

      // Deployment inventory section line
      const inventoryLine = "- Renamed storage prefix: `cybergym_` -> `yourbody_`\n";
      const violations3 = scanContent('docs/deployment.md', inventoryLine);
      expect(violations3).toHaveLength(0);
    });

    it('non-allowlisted line in an allowlisted file fails', () => {
      // scripts/migrate-historical-data.py line without D-YB-4 keep comment or uuid5 seed
      const badMigrationLine = 'print("Welcome to CyberGym")\n';
      const violations1 = scanContent('scripts/migrate-historical-data.py', badMigrationLine);
      expect(violations1).toHaveLength(1);
      expect(violations1[0].line).toBe(1);

      // src/test/runtimeNames.test.ts line without // check-brand: allow comment
      const badTestLine = 'const forbidden = "cybergym";\n';
      const violations2 = scanContent('src/test/runtimeNames.test.ts', badTestLine);
      expect(violations2).toHaveLength(1);
      expect(violations2[0].line).toBe(1);

      // docs/deployment.md line outside inventory section
      const badDocLine = 'Visit https://cybergym.app to get started.\n';
      const violations3 = scanContent('docs/deployment.md', badDocLine);
      expect(violations3).toHaveLength(1);
      expect(violations3[0].line).toBe(1);
    });

    it('CYBER- and com.cybergym patterns are caught', () => {
      const cyberContent = 'export const DEFAULT_COACH = "CYBER-COACH1";\n';
      const cyberViolations = scanContent('src/config.ts', cyberContent);
      expect(cyberViolations).toHaveLength(1);
      expect(cyberViolations[0].token).toBe('CYBER-');

      const pkgContent = 'namespace "com.cybergym.app"\n';
      const pkgViolations = scanContent('android/build.gradle', pkgContent);
      expect(pkgViolations).toHaveLength(1);
      expect(pkgViolations[0].token).toBe('com.cybergym');
    });
  });
});
