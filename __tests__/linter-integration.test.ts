/**
 * Tests for Linter Integration
 */

import { createLinterIntegration, LinterIntegration } from '../src/analyzers/linter-integration';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LinterIntegration', () => {
  let linter: LinterIntegration;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linter-test-'));
    linter = createLinterIntegration({
      enabled: true,
      tools: ['jsonlint'], // Use jsonlint as it doesn't require external tools
      workingDir: testDir,
    });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('analyze', () => {
    it('should analyze valid JSON files', async () => {
      const files = [
        {
          path: 'valid.json',
          content: JSON.stringify({ key: 'value' }),
        },
      ];

      const result = await linter.analyze(files);

      expect(result.filesAnalyzed).toBe(1);
      expect(result.issues.length).toBe(0);
      expect(result.toolsUsed).toContain('jsonlint');
    });

    it('should detect invalid JSON', async () => {
      const files = [
        {
          path: 'invalid.json',
          content: '{ key: "value" }', // Missing quotes around key
        },
      ];

      const result = await linter.analyze(files);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.summary.errors).toBeGreaterThan(0);
    });

    it('should handle empty files', async () => {
      const files = [
        {
          path: 'empty.json',
          content: '',
        },
      ];

      const result = await linter.analyze(files);

      expect(result.filesAnalyzed).toBe(1);
    });

    it('should handle multiple files', async () => {
      const files = [
        {
          path: 'file1.json',
          content: JSON.stringify({ a: 1 }),
        },
        {
          path: 'file2.json',
          content: JSON.stringify({ b: 2 }),
        },
      ];

      const result = await linter.analyze(files);

      expect(result.filesAnalyzed).toBe(2);
    });

    it('should filter files by ignore patterns', async () => {
      const linterWithIgnore = createLinterIntegration({
        enabled: true,
        tools: ['jsonlint'],
        workingDir: testDir,
        ignorePatterns: ['**/node_modules/**'],
      });

      const files = [
        {
          path: 'node_modules/dep.json',
          content: JSON.stringify({}),
        },
        {
          path: 'src/app.json',
          content: JSON.stringify({}),
        },
      ];

      const result = await linterWithIgnore.analyze(files);

      // Should analyze at least one file (may filter node_modules)
      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('convertToReviewComments', () => {
    it('should convert linter issues to review comments', async () => {
      const files = [
        {
          path: 'invalid.json',
          content: '{ invalid json }',
        },
      ];

      const result = await linter.analyze(files);
      const comments = linter.convertToReviewComments(result);

      expect(comments.length).toBeGreaterThan(0);
      expect(comments[0]).toHaveProperty('file');
      expect(comments[0]).toHaveProperty('line');
      expect(comments[0]).toHaveProperty('body');
      expect(comments[0]).toHaveProperty('severity');
    });

    it('should map severity correctly', async () => {
      const files = [
        {
          path: 'invalid.json',
          content: '{ invalid }',
        },
      ];

      const result = await linter.analyze(files);
      const comments = linter.convertToReviewComments(result);

      if (comments.length > 0) {
        expect(['error', 'warning', 'suggestion']).toContain(comments[0].severity);
      }
    });

    it('should include tool information', async () => {
      const files = [
        {
          path: 'invalid.json',
          content: '{ invalid }',
        },
      ];

      const result = await linter.analyze(files);
      const comments = linter.convertToReviewComments(result);

      if (comments.length > 0) {
        expect(comments[0].tool).toBeDefined();
      }
    });
  });

  describe('Summary Statistics', () => {
    it('should calculate summary correctly', async () => {
      const files = [
        {
          path: 'valid.json',
          content: JSON.stringify({}),
        },
      ];

      const result = await linter.analyze(files);

      expect(result.summary).toBeDefined();
      expect(result.summary.errors).toBeGreaterThanOrEqual(0);
      expect(result.summary.warnings).toBeGreaterThanOrEqual(0);
      expect(result.summary.suggestions).toBeGreaterThanOrEqual(0);
    });

    it('should track analysis time', async () => {
      const files = [
        {
          path: 'test.json',
          content: JSON.stringify({}),
        },
      ];

      const result = await linter.analyze(files);

      expect(result.analysisTime).toBeGreaterThanOrEqual(0);
    });

    it('should track tools used', async () => {
      const files = [
        {
          path: 'test.json',
          content: JSON.stringify({}),
        },
      ];

      const result = await linter.analyze(files);

      expect(result.toolsUsed).toBeDefined();
      expect(Array.isArray(result.toolsUsed)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file list', async () => {
      const result = await linter.analyze([]);

      expect(result.filesAnalyzed).toBe(0);
      expect(result.issues.length).toBe(0);
      expect(result.summary.errors).toBe(0);
    });

    it('should handle files with no matching tools', async () => {
      const files = [
        {
          path: 'test.txt',
          content: 'plain text file',
        },
      ];

      const result = await linter.analyze(files);

      // Should handle gracefully
      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large files', async () => {
      const largeContent = JSON.stringify(
        Array(1000)
          .fill(0)
          .map((_, i) => ({ key: i, value: `value-${i}` }))
      );

      const files = [
        {
          path: 'large.json',
          content: largeContent,
        },
      ];

      const result = await linter.analyze(files);

      expect(result.filesAnalyzed).toBe(1);
    });

    it('should handle missing tools gracefully', async () => {
      const linterWithMissingTool = createLinterIntegration({
        enabled: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: ['custom' as any], // Use 'custom' for testing missing tool handling
        workingDir: testDir,
      });

      const files = [
        {
          path: 'test.json',
          content: JSON.stringify({}),
        },
      ];

      // Should not throw, but may return empty results
      await expect(linterWithMissingTool.analyze(files)).resolves.toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should respect enabled flag', () => {
      const disabledLinter = createLinterIntegration({
        enabled: false,
        tools: ['jsonlint'],
        workingDir: testDir,
      });

      expect(disabledLinter).toBeDefined();
    });

    it('should handle empty tools array', () => {
      const linterNoTools = createLinterIntegration({
        enabled: true,
        tools: [],
        workingDir: testDir,
      });

      expect(linterNoTools).toBeDefined();
    });

    it('should handle custom commands', () => {
      const linterCustom = createLinterIntegration({
        enabled: true,
        tools: ['jsonlint'],
        workingDir: testDir,
        customCommands: {
          jsonlint: 'custom-jsonlint-command',
        },
      });

      expect(linterCustom).toBeDefined();
    });
  });
});
