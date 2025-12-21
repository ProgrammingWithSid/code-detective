/**
 * Tests for Codegraph Analyzer
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodegraphAnalyzer, createCodegraphAnalyzer } from '../src/analyzers/codegraph-analyzer';
import { ChangedFile } from '../src/types';

describe('CodegraphAnalyzer', () => {
  let analyzer: CodegraphAnalyzer;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-test-'));
    analyzer = createCodegraphAnalyzer({
      rootDir: testDir,
      maxDepth: 5,
      analyzeInternal: true,
    });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('buildGraph', () => {
    it('should build graph for TypeScript files', async () => {
      // Create test files
      const file1 = path.join(testDir, 'file1.ts');
      const file2 = path.join(testDir, 'file2.ts');

      fs.writeFileSync(
        file1,
        `export function func1() { return 'test'; }
export const CONST = 1;`
      );
      fs.writeFileSync(
        file2,
        `import { func1 } from './file1';
export function func2() { return func1(); }`
      );

      await analyzer.buildGraph([file1, file2]);

      const deps1 = analyzer.getDependencies(file1);
      const deps2 = analyzer.getDependencies(file2);

      expect(deps1).toBeDefined();
      expect(deps2).toBeDefined();
      expect(deps1!.exports.length).toBeGreaterThan(0);
      expect(deps2!.imports.length).toBeGreaterThan(0);
      expect(deps2!.fileDeps).toContain(file1);
    });

    it('should handle files with no dependencies', async () => {
      const file = path.join(testDir, 'standalone.ts');
      fs.writeFileSync(file, 'const x = 1;');

      await analyzer.buildGraph([file]);

      const deps = analyzer.getDependencies(file);
      expect(deps).toBeDefined();
      expect(deps!.fileDeps.length).toBe(0);
      expect(deps!.imports.length).toBe(0);
    });

    it('should handle circular dependencies', async () => {
      const file1 = path.join(testDir, 'a.ts');
      const file2 = path.join(testDir, 'b.ts');

      fs.writeFileSync(
        file1,
        `import { funcB } from './b'; export function funcA() { return funcB(); }`
      );
      fs.writeFileSync(
        file2,
        `import { funcA } from './a'; export function funcB() { return funcA(); }`
      );

      await analyzer.buildGraph([file1, file2]);

      const depsA = analyzer.getDependencies(file1);
      const depsB = analyzer.getDependencies(file2);

      expect(depsA).toBeDefined();
      expect(depsB).toBeDefined();
      expect(depsA!.fileDeps).toContain(file2);
      expect(depsB!.fileDeps).toContain(file1);
    });

    it('should exclude files matching exclude patterns', async () => {
      const file1 = path.join(testDir, 'src', 'file.ts');
      const file2 = path.join(testDir, 'node_modules', 'dep.ts');

      fs.mkdirSync(path.dirname(file1), { recursive: true });
      fs.mkdirSync(path.dirname(file2), { recursive: true });

      fs.writeFileSync(file1, 'export const x = 1;');
      fs.writeFileSync(file2, 'export const y = 2;');

      await analyzer.buildGraph([file1, file2]);

      const deps = analyzer.getDependencies(file1);
      // node_modules should be excluded
      expect(deps).toBeDefined();
      expect(deps!.fileDeps).not.toContain(file2);
    });
  });

  describe('analyzeImpact', () => {
    beforeEach(async () => {
      // Setup a simple dependency graph
      const file1 = path.join(testDir, 'base.ts');
      const file2 = path.join(testDir, 'middle.ts');
      const file3 = path.join(testDir, 'top.ts');

      fs.writeFileSync(file1, 'export function base() { return 1; }');
      fs.writeFileSync(
        file2,
        `import { base } from './base'; export function middle() { return base(); }`
      );
      fs.writeFileSync(
        file3,
        `import { middle } from './middle'; export function top() { return middle(); }`
      );

      await analyzer.buildGraph([file1, file2, file3]);
    });

    it('should identify affected files', () => {
      const file1 = path.join(testDir, 'base.ts');
      const file2 = path.join(testDir, 'middle.ts');
      const file3 = path.join(testDir, 'top.ts');
      const changedFiles: ChangedFile[] = [
        {
          path: file1,
          additions: 10,
          deletions: 5,
          status: 'modified',
        },
      ];

      const impact = analyzer.analyzeImpact(changedFiles);

      expect(impact.changedFiles).toContain(file1);
      expect(impact.affectedFiles.length).toBeGreaterThan(0);
      expect(impact.affectedFiles).toContain(file2);
      expect(impact.affectedFiles).toContain(file3);
    });

    it('should calculate severity correctly', () => {
      const file1 = path.join(testDir, 'base.ts');
      const changedFiles: ChangedFile[] = [
        {
          path: file1,
          additions: 100,
          deletions: 50,
          status: 'modified',
        },
      ];

      const impact = analyzer.analyzeImpact(changedFiles);

      expect(['high', 'medium', 'low']).toContain(impact.severity);
      expect(impact.reviewScope).toBeGreaterThan(0);
    });

    it('should handle multiple changed files', () => {
      const file1 = path.join(testDir, 'base.ts');
      const file2 = path.join(testDir, 'middle.ts');
      const changedFiles: ChangedFile[] = [
        {
          path: file1,
          additions: 10,
          deletions: 5,
          status: 'modified',
        },
        {
          path: file2,
          additions: 5,
          deletions: 2,
          status: 'modified',
        },
      ];

      const impact = analyzer.analyzeImpact(changedFiles);

      expect(impact.changedFiles.length).toBe(2);
      expect(impact.affectedFiles.length).toBeGreaterThan(0);
    });

    it('should return low severity for isolated changes', async () => {
      const file = path.join(testDir, 'isolated.ts');
      fs.writeFileSync(file, 'const x = 1;');

      await analyzer.buildGraph([file]);
      const changedFiles: ChangedFile[] = [
        {
          path: file,
          additions: 1,
          deletions: 0,
          status: 'modified',
        },
      ];

      const impact = analyzer.analyzeImpact(changedFiles);

      expect(impact.severity).toBe('low');
      expect(impact.affectedFiles.length).toBe(0);
    });
  });

  describe('getDependencies', () => {
    beforeEach(async () => {
      const file1 = path.join(testDir, 'lib.ts');
      const file2 = path.join(testDir, 'app.ts');

      fs.writeFileSync(
        file1,
        `export function helper() { return 'help'; }
export class HelperClass {}
export type HelperType = string;`
      );
      fs.writeFileSync(
        file2,
        `import { helper, HelperClass, type HelperType } from './lib';
export function app() { return helper(); }`
      );

      await analyzer.buildGraph([file1, file2]);
    });

    it('should return imports and exports', () => {
      const file1 = path.join(testDir, 'lib.ts');
      const file2 = path.join(testDir, 'app.ts');
      const deps = analyzer.getDependencies(file2);

      expect(deps).toBeDefined();
      expect(deps!.imports.length).toBeGreaterThan(0);
      expect(deps!.exports.length).toBeGreaterThan(0);
      expect(deps!.fileDeps).toContain(file1);
    });

    it('should return empty for non-existent file', () => {
      const deps = analyzer.getDependencies('nonexistent.ts');

      expect(deps).toBeUndefined();
    });
  });

  describe('generateVisualization', () => {
    beforeEach(async () => {
      const file1 = path.join(testDir, 'a.ts');
      const file2 = path.join(testDir, 'b.ts');

      fs.writeFileSync(file1, 'export function a() {}');
      fs.writeFileSync(file2, `import { a } from './a'; export function b() { a(); }`);

      await analyzer.buildGraph([file1, file2]);
    });

    it('should generate Mermaid diagram', () => {
      const file1 = path.join(testDir, 'a.ts');
      const file2 = path.join(testDir, 'b.ts');
      const diagram = analyzer.generateVisualization([file1, file2]);

      expect(diagram).toContain('graph');
      expect(diagram).toContain('a.ts');
      expect(diagram).toContain('b.ts');
    });

    it('should handle empty file list', () => {
      const diagram = analyzer.generateVisualization([]);

      expect(diagram).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file list', async () => {
      await analyzer.buildGraph([]);

      const impact = analyzer.analyzeImpact([]);
      expect(impact.changedFiles.length).toBe(0);
      expect(impact.affectedFiles.length).toBe(0);
    });

    it('should handle malformed imports gracefully', async () => {
      const file = path.join(testDir, 'malformed.ts');
      fs.writeFileSync(file, 'import { broken from "./nonexistent";');

      await expect(analyzer.buildGraph([file])).resolves.not.toThrow();
    });

    it('should handle very large files', async () => {
      const file = path.join(testDir, 'large.ts');
      const largeContent = Array(1000)
        .fill(0)
        .map((_, i) => `export function func${i}() { return ${i}; }`)
        .join('\n');

      fs.writeFileSync(file, largeContent);

      await analyzer.buildGraph([file]);

      const deps = analyzer.getDependencies(file);
      expect(deps).toBeDefined();
      expect(deps!.exports.length).toBeGreaterThan(0);
    });
  });
});
