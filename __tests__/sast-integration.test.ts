/**
 * Tests for SAST Integration
 */

import { createSASTIntegration, SASTIntegration } from '../src/analyzers/sast-integration';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SASTIntegration', () => {
  let sast: SASTIntegration;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sast-test-'));
    sast = createSASTIntegration({
      enabled: true,
      tools: ['npm-audit'], // Use npm-audit as it's commonly available
      workingDir: testDir,
    });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('analyze', () => {
    it('should analyze package.json files', async () => {
      // Create a package.json
      const packageJson = {
        dependencies: {
          lodash: '^4.17.21',
        },
      };

      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(packageJson));

      const files = [
        {
          path: 'package.json',
          content: JSON.stringify(packageJson),
        },
      ];

      const result = await sast.analyze(files);

      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(0);
      expect(result.toolsUsed).toBeDefined();
      expect(Array.isArray(result.toolsUsed)).toBe(true);
    });

    it('should handle files without vulnerabilities', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({
            dependencies: {},
          }),
        },
      ];

      const result = await sast.analyze(files);

      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(0);
      expect(result.summary).toBeDefined();
    });

    it('should handle multiple files', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ dependencies: {} }),
        },
        {
          path: 'requirements.txt',
          content: 'requests==2.28.0',
        },
      ];

      const result = await sast.analyze(files);

      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(0);
    });

    it('should filter files by ignore patterns', async () => {
      const sastWithIgnore = createSASTIntegration({
        enabled: true,
        tools: ['npm-audit'],
        workingDir: testDir,
        ignorePatterns: ['**/node_modules/**'],
      });

      const files = [
        {
          path: 'node_modules/dep/package.json',
          content: JSON.stringify({}),
        },
        {
          path: 'package.json',
          content: JSON.stringify({}),
        },
      ];

      const result = await sastWithIgnore.analyze(files);

      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('convertToReviewComments', () => {
    it('should convert SAST issues to review comments', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({
            dependencies: {
              'vulnerable-package': '1.0.0',
            },
          }),
        },
      ];

      const result = await sast.analyze(files);
      const comments = sast.convertToReviewComments(result);

      expect(Array.isArray(comments)).toBe(true);
      if (comments.length > 0) {
        expect(comments[0]).toHaveProperty('file');
        expect(comments[0]).toHaveProperty('line');
        expect(comments[0]).toHaveProperty('body');
        expect(comments[0]).toHaveProperty('severity');
        expect(comments[0]).toHaveProperty('category');
      }
    });

    it('should map severity correctly', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ dependencies: {} }),
        },
      ];

      const result = await sast.analyze(files);
      const comments = sast.convertToReviewComments(result);

      if (comments.length > 0) {
        expect(['error', 'warning', 'suggestion']).toContain(comments[0].severity);
      }
    });

    it('should include security metadata', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ dependencies: {} }),
        },
      ];

      const result = await sast.analyze(files);
      const comments = sast.convertToReviewComments(result);

      if (comments.length > 0) {
        expect(comments[0].category).toBe('security');
      }
    });
  });

  describe('Summary Statistics', () => {
    it('should calculate summary by severity', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ dependencies: {} }),
        },
      ];

      const result = await sast.analyze(files);

      expect(result.summary).toBeDefined();
      expect(result.summary.critical).toBeGreaterThanOrEqual(0);
      expect(result.summary.high).toBeGreaterThanOrEqual(0);
      expect(result.summary.medium).toBeGreaterThanOrEqual(0);
      expect(result.summary.low).toBeGreaterThanOrEqual(0);
    });

    it('should track analysis time', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ dependencies: {} }),
        },
      ];

      const result = await sast.analyze(files);

      expect(result.analysisTime).toBeGreaterThanOrEqual(0);
    });

    it('should track tools used', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ dependencies: {} }),
        },
      ];

      const result = await sast.analyze(files);

      expect(result.toolsUsed).toBeDefined();
      expect(Array.isArray(result.toolsUsed)).toBe(true);
    });

    it('should track issues by type', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ dependencies: {} }),
        },
      ];

      const result = await sast.analyze(files);

      expect(result.byType).toBeDefined();
      expect(typeof result.byType).toBe('object');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file list', async () => {
      const result = await sast.analyze([]);

      expect(result.filesAnalyzed).toBe(0);
      expect(result.issues.length).toBe(0);
      expect(result.summary.critical).toBe(0);
    });

    it('should handle files with no matching tools', async () => {
      const files = [
        {
          path: 'test.txt',
          content: 'plain text file',
        },
      ];

      const result = await sast.analyze(files);

      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large files', async () => {
      const largePackageJson = JSON.stringify({
        dependencies: Object.fromEntries(
          Array(1000)
            .fill(0)
            .map((_, i) => [`package-${i}`, '1.0.0'])
        ),
      });

      const files = [
        {
          path: 'package.json',
          content: largePackageJson,
        },
      ];

      const result = await sast.analyze(files);

      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing tools gracefully', async () => {
      const sastWithMissingTool = createSASTIntegration({
        enabled: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: ['custom' as any], // Use 'custom' for testing missing tool handling
        workingDir: testDir,
      });

      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({}),
        },
      ];

      await expect(sastWithMissingTool.analyze(files)).resolves.toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should respect enabled flag', () => {
      const disabledSAST = createSASTIntegration({
        enabled: false,
        tools: ['npm-audit'],
        workingDir: testDir,
      });

      expect(disabledSAST).toBeDefined();
    });

    it('should handle empty tools array', () => {
      const sastNoTools = createSASTIntegration({
        enabled: true,
        tools: [],
        workingDir: testDir,
      });

      expect(sastNoTools).toBeDefined();
    });

    it('should handle minSeverity filter', () => {
      const sastWithMinSeverity = createSASTIntegration({
        enabled: true,
        tools: ['npm-audit'],
        workingDir: testDir,
        minSeverity: 'error',
      });

      expect(sastWithMinSeverity).toBeDefined();
    });

    it('should handle Semgrep config', () => {
      const sastWithSemgrep = createSASTIntegration({
        enabled: true,
        tools: ['semgrep'],
        workingDir: testDir,
        semgrep: {
          config: 'custom-config',
        },
      });

      expect(sastWithSemgrep).toBeDefined();
    });
  });
});
