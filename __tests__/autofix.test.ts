/**
 * Tests for Auto-Fix Module
 */

import {
  FixGenerator,
  createFixGenerator,
  FixApplier,
  createFixApplier,
  AutoFix,
  createAutoFix,
  createDefaultAutoFix,
} from '../src/autofix';
import {
  CodeFix,
  FixSuggestion,
  FixGenerationContext,
  COMMON_FIX_PATTERNS,
} from '../src/types/autofix';

describe('FixGenerator', () => {
  let generator: FixGenerator;

  beforeEach(() => {
    generator = createFixGenerator();
  });

  describe('generateFixes', () => {
    it('should generate fix for null check issue', () => {
      const context: FixGenerationContext = {
        filePath: 'test.ts',
        fileContent: `
const user = getUser();
const name = user.name;
const age = user.profile.age;
`,
        language: 'typescript',
        comments: [
          {
            file: 'test.ts',
            line: 4,
            body: 'Potential null or undefined value. Add null check.',
            severity: 'warning',
          },
        ],
      };

      const result = generator.generateFixes(context);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.stats.fixesGenerated).toBeGreaterThan(0);
    });

    it('should generate fix for unused variable', () => {
      const context: FixGenerationContext = {
        filePath: 'test.ts',
        fileContent: `
const unusedVar = 42;
console.log('hello');
`,
        language: 'typescript',
        comments: [
          {
            file: 'test.ts',
            line: 2,
            body: 'Unused variable unusedVar',
            severity: 'warning',
          },
        ],
      };

      const result = generator.generateFixes(context);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const fix = result.suggestions[0]?.fix;
      expect(fix?.fixedCode).toContain('_unusedVar');
    });

    it('should generate fix for console.log removal', () => {
      const context: FixGenerationContext = {
        filePath: 'test.ts',
        fileContent: `
function test() {
  console.log('debug');
  return 42;
}
`,
        language: 'typescript',
        comments: [
          {
            file: 'test.ts',
            line: 3,
            body: 'Remove console.log for production',
            severity: 'info',
          },
        ],
      };

      const result = generator.generateFixes(context);

      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle comments without fixes', () => {
      const context: FixGenerationContext = {
        filePath: 'test.ts',
        fileContent: 'const x = 1;',
        language: 'typescript',
        comments: [
          {
            file: 'test.ts',
            line: 1,
            body: 'This code has a complex architectural issue that requires manual review',
            severity: 'error',
          },
        ],
      };

      const result = generator.generateFixes(context);

      expect(result.unfixable.length).toBeGreaterThan(0);
    });

    it('should calculate correct stats', () => {
      const context: FixGenerationContext = {
        filePath: 'test.ts',
        fileContent: `
const x = obj.value;
const y = obj.other;
`,
        language: 'typescript',
        comments: [
          { file: 'test.ts', line: 2, body: 'null check needed', severity: 'warning' },
          { file: 'test.ts', line: 3, body: 'null check needed', severity: 'warning' },
        ],
      };

      const result = generator.generateFixes(context);

      expect(result.stats.totalComments).toBe(2);
      expect(result.stats.generationTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('confidence threshold', () => {
    it('should respect minConfidence option', () => {
      const highConfidenceGenerator = createFixGenerator({ minConfidence: 'high' });

      const context: FixGenerationContext = {
        filePath: 'test.ts',
        fileContent: 'const x = obj.value;',
        language: 'typescript',
        comments: [{ file: 'test.ts', line: 1, body: 'null safety', severity: 'warning' }],
      };

      const result = highConfidenceGenerator.generateFixes(context);

      // All returned fixes should be high confidence
      for (const suggestion of result.suggestions) {
        expect(suggestion.fix.confidence).toBe('high');
      }
    });
  });
});

describe('FixApplier', () => {
  let applier: FixApplier;

  beforeEach(() => {
    applier = createFixApplier({ dryRun: true });
  });

  describe('applyFixes', () => {
    it('should apply replace fix correctly', () => {
      const fixes: CodeFix[] = [
        {
          id: 'fix-1',
          type: 'replace',
          filePath: 'test.ts',
          startLine: 2,
          endLine: 2,
          originalCode: 'const x = obj.value;',
          fixedCode: 'const x = obj?.value;',
          description: 'Add optional chaining',
          category: 'safety',
          severity: 'warning',
          confidence: 'high',
          isAutoApplicable: true,
        },
      ];

      const fileContents = new Map([
        ['test.ts', 'import foo from "foo";\nconst x = obj.value;\nconst y = 2;'],
      ]);

      const result = applier.applyFixes(fixes, fileContents);

      expect(result.applied.length).toBe(1);
      expect(result.failed.length).toBe(0);
      expect(result.isDryRun).toBe(true);
    });

    it('should skip non-auto-applicable fixes when option set', () => {
      const strictApplier = createFixApplier({
        dryRun: true,
        autoApplicableOnly: true,
      });

      const fixes: CodeFix[] = [
        {
          id: 'fix-1',
          type: 'replace',
          filePath: 'test.ts',
          startLine: 1,
          endLine: 1,
          originalCode: 'const x = 1;',
          fixedCode: 'const x: number = 1;',
          description: 'Add type annotation',
          category: 'typescript',
          severity: 'info',
          confidence: 'medium',
          isAutoApplicable: false,
        },
      ];

      const fileContents = new Map([['test.ts', 'const x = 1;']]);
      const result = strictApplier.applyFixes(fixes, fileContents);

      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0].reason).toContain('not auto-applicable');
    });

    it('should skip low confidence fixes when threshold is high', () => {
      const highConfApplier = createFixApplier({
        dryRun: true,
        minConfidence: 'high',
      });

      const fixes: CodeFix[] = [
        {
          id: 'fix-1',
          type: 'replace',
          filePath: 'test.ts',
          startLine: 1,
          endLine: 1,
          originalCode: 'code',
          fixedCode: 'fixed',
          description: 'Fix',
          category: 'general',
          severity: 'info',
          confidence: 'low',
          isAutoApplicable: true,
        },
      ];

      const fileContents = new Map([['test.ts', 'code']]);
      const result = highConfApplier.applyFixes(fixes, fileContents);

      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0].reason).toContain('confidence');
    });

    it('should detect and handle conflicting fixes', () => {
      const fixes: CodeFix[] = [
        {
          id: 'fix-1',
          type: 'replace',
          filePath: 'test.ts',
          startLine: 2,
          endLine: 3,
          originalCode: 'line2\nline3',
          fixedCode: 'fixed2\nfixed3',
          description: 'Fix A',
          category: 'general',
          severity: 'warning',
          confidence: 'high',
          isAutoApplicable: true,
        },
        {
          id: 'fix-2',
          type: 'replace',
          filePath: 'test.ts',
          startLine: 3,
          endLine: 4,
          originalCode: 'line3\nline4',
          fixedCode: 'different',
          description: 'Fix B',
          category: 'general',
          severity: 'warning',
          confidence: 'medium',
          isAutoApplicable: true,
        },
      ];

      const fileContents = new Map([['test.ts', 'line1\nline2\nline3\nline4']]);
      const result = applier.applyFixes(fixes, fileContents);

      // One fix should be applied, the other skipped due to conflict
      expect(result.applied.length + result.skipped.length).toBe(2);
    });
  });

  describe('generateDiff', () => {
    it('should generate unified diff', () => {
      const fixes: CodeFix[] = [
        {
          id: 'fix-1',
          type: 'replace',
          filePath: 'test.ts',
          startLine: 2,
          endLine: 2,
          originalCode: 'const x = obj.value;',
          fixedCode: 'const x = obj?.value;',
          description: 'Add optional chaining',
          category: 'safety',
          severity: 'warning',
          confidence: 'high',
          isAutoApplicable: true,
        },
      ];

      const fileContent = 'import foo from "foo";\nconst x = obj.value;\nconst y = 2;';
      const diff = applier.generateDiff(fixes, fileContent);

      expect(diff.filePath).toBe('test.ts');
      expect(diff.unifiedDiff).toContain('-const x = obj.value;');
      expect(diff.unifiedDiff).toContain('+const x = obj?.value;');
      expect(diff.fixesApplied.length).toBe(1);
    });

    it('should handle empty fixes array', () => {
      const diff = applier.generateDiff([], 'const x = 1;');

      expect(diff.fixesApplied.length).toBe(0);
      expect(diff.additions).toBe(0);
      expect(diff.deletions).toBe(0);
    });
  });

  describe('validateFix', () => {
    it('should validate fix with correct line numbers', () => {
      const fix: CodeFix = {
        id: 'fix-1',
        type: 'replace',
        filePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        originalCode: 'const x = 1;',
        fixedCode: 'const x: number = 1;',
        description: 'Add type',
        category: 'typescript',
        severity: 'info',
        confidence: 'high',
        isAutoApplicable: true,
      };

      const validation = applier.validateFix(fix, 'const x = 1;\nconst y = 2;');

      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should fail validation for out of range lines', () => {
      const fix: CodeFix = {
        id: 'fix-1',
        type: 'replace',
        filePath: 'test.ts',
        startLine: 100,
        endLine: 100,
        originalCode: 'code',
        fixedCode: 'fixed',
        description: 'Fix',
        category: 'general',
        severity: 'info',
        confidence: 'high',
        isAutoApplicable: true,
      };

      const validation = applier.validateFix(fix, 'const x = 1;');

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should warn for low confidence fixes', () => {
      const fix: CodeFix = {
        id: 'fix-1',
        type: 'replace',
        filePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        originalCode: 'const x = 1;',
        fixedCode: 'const x = 2;',
        description: 'Change value',
        category: 'general',
        severity: 'info',
        confidence: 'low',
        isAutoApplicable: true,
      };

      const validation = applier.validateFix(fix, 'const x = 1;');

      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some((w) => w.includes('low confidence'))).toBe(true);
    });
  });
});

describe('AutoFix Service', () => {
  let autofix: AutoFix;

  beforeEach(() => {
    autofix = createAutoFix();
  });

  describe('generateFixes', () => {
    it('should generate fixes for context', () => {
      const context: FixGenerationContext = {
        filePath: 'api.ts',
        fileContent: `
async function fetchUser(id: string) {
  const response = await fetch('/api/users/' + id);
  return response.json();
}
`,
        language: 'typescript',
        comments: [
          {
            file: 'api.ts',
            line: 3,
            body: 'Use template literal instead of string concatenation',
            severity: 'info',
          },
        ],
      };

      const result = autofix.generateFixes(context);

      expect(result.stats.totalComments).toBe(1);
    });
  });

  describe('formatAsMarkdown', () => {
    it('should format suggestions as markdown', () => {
      const suggestions: FixSuggestion[] = [
        {
          comment: {
            file: 'test.ts',
            line: 10,
            body: 'Null check needed',
            severity: 'warning',
          },
          fix: {
            id: 'fix-1',
            type: 'replace',
            filePath: 'test.ts',
            startLine: 10,
            endLine: 10,
            originalCode: 'const x = obj.value;',
            fixedCode: 'const x = obj?.value;',
            description: 'Add optional chaining',
            category: 'safety',
            severity: 'warning',
            confidence: 'high',
            isAutoApplicable: true,
          },
          explanation: 'Added optional chaining for safety',
        },
      ];

      const markdown = autofix.formatAsMarkdown(suggestions);

      expect(markdown).toContain('Suggested Fixes');
      expect(markdown).toContain('test.ts');
      expect(markdown).toContain('optional chaining');
      expect(markdown).toContain('Before');
      expect(markdown).toContain('After');
      expect(markdown).toContain('Summary');
    });

    it('should handle empty suggestions', () => {
      const markdown = autofix.formatAsMarkdown([]);
      expect(markdown).toContain('No fix suggestions');
    });
  });

  describe('formatAsGitHubSuggestion', () => {
    it('should format fix as GitHub suggestion', () => {
      const fix: CodeFix = {
        id: 'fix-1',
        type: 'replace',
        filePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        originalCode: 'const x = 1;',
        fixedCode: 'const x: number = 1;',
        description: 'Add type annotation',
        category: 'typescript',
        severity: 'info',
        confidence: 'high',
        isAutoApplicable: true,
      };

      const suggestion = autofix.formatAsGitHubSuggestion(fix);

      expect(suggestion).toContain('```suggestion');
      expect(suggestion).toContain('const x: number = 1;');
      expect(suggestion).toContain('Add type annotation');
    });
  });

  describe('validateFixes', () => {
    it('should validate multiple fixes', () => {
      const fixes: CodeFix[] = [
        {
          id: 'fix-1',
          type: 'replace',
          filePath: 'test.ts',
          startLine: 1,
          endLine: 1,
          originalCode: 'a',
          fixedCode: 'b',
          description: 'Fix 1',
          category: 'general',
          severity: 'info',
          confidence: 'high',
          isAutoApplicable: true,
        },
        {
          id: 'fix-2',
          type: 'replace',
          filePath: 'test.ts',
          startLine: 999,
          endLine: 999,
          originalCode: 'x',
          fixedCode: 'y',
          description: 'Fix 2',
          category: 'general',
          severity: 'info',
          confidence: 'high',
          isAutoApplicable: true,
        },
      ];

      const validations = autofix.validateFixes(fixes, 'a\nb\nc');

      expect(validations.size).toBe(2);
      expect(validations.get('fix-1')?.isValid).toBe(true);
      expect(validations.get('fix-2')?.isValid).toBe(false);
    });
  });
});

describe('createDefaultAutoFix', () => {
  it('should create AutoFix with default options', () => {
    const autofix = createDefaultAutoFix();
    expect(autofix).toBeInstanceOf(AutoFix);
  });
});

describe('COMMON_FIX_PATTERNS', () => {
  it('should have patterns for null checks', () => {
    const nullCheckPattern = COMMON_FIX_PATTERNS.find((p) => p.name === 'add-null-check');
    expect(nullCheckPattern).toBeDefined();
    expect(nullCheckPattern?.confidence).toBe('high');
  });

  it('should have patterns for const usage', () => {
    const constPattern = COMMON_FIX_PATTERNS.find((p) => p.name === 'use-const');
    expect(constPattern).toBeDefined();
    expect(constPattern?.autoApplicable).toBe(true);
  });

  it('should have patterns for console.log removal', () => {
    const consolePattern = COMMON_FIX_PATTERNS.find((p) => p.name === 'remove-console-log');
    expect(consolePattern).toBeDefined();
  });
});

describe('Fix Types', () => {
  const applier = createFixApplier({ dryRun: true });

  it('should handle insert fix type', () => {
    const fixes: CodeFix[] = [
      {
        id: 'fix-1',
        type: 'insert',
        filePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        originalCode: '',
        fixedCode: '// @ts-check',
        description: 'Add TS check comment',
        category: 'typescript',
        severity: 'info',
        confidence: 'high',
        isAutoApplicable: true,
      },
    ];

    const diff = applier.generateDiff(fixes, 'const x = 1;');

    expect(diff.fixed).toContain('// @ts-check');
  });

  it('should handle delete fix type', () => {
    const fixes: CodeFix[] = [
      {
        id: 'fix-1',
        type: 'delete',
        filePath: 'test.ts',
        startLine: 2,
        endLine: 2,
        originalCode: 'console.log("debug");',
        fixedCode: '',
        description: 'Remove debug log',
        category: 'cleanup',
        severity: 'info',
        confidence: 'high',
        isAutoApplicable: true,
      },
    ];

    const diff = applier.generateDiff(fixes, 'const x = 1;\nconsole.log("debug");\nconst y = 2;');

    expect(diff.fixed).not.toContain('console.log');
    expect(diff.deletions).toBeGreaterThan(0);
  });
});
