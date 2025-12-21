/**
 * Tests for Codegraph Analyzer with Injected Indexer
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodegraphAnalyzer, createCodegraphAnalyzer } from '../src/analyzers/codegraph-analyzer';
import { CodeIndexer, DependencyExtraction, SymbolExtraction } from '../src/types';

describe('CodegraphAnalyzer with Indexer Decoupling', () => {
  let testDir: string;
  let analyzer: CodegraphAnalyzer;

  // Mock Indexer
  const mockIndexer: CodeIndexer = {
    isAvailable: jest.fn().mockResolvedValue(true),
    extractSymbols: jest.fn().mockResolvedValue([]),
    extractDeps: jest.fn().mockResolvedValue([]),
    getHash: jest.fn().mockResolvedValue('mock-hash'),
  };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-indexer-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should fall back to local analysis when no indexer is provided', async () => {
    analyzer = createCodegraphAnalyzer({ rootDir: testDir });

    const filePath = path.join(testDir, 'test.ts');
    fs.writeFileSync(filePath, 'export const x = 1;');

    await analyzer.buildGraph([filePath]);

    const deps = analyzer.getDependencies(filePath);
    expect(deps).toBeDefined();
    expect(deps!.exports).toContain('x');
  });

  it('should use the provided indexer when available', async () => {
    const mockSymbols: SymbolExtraction[] = [
      {
        name: 'injectedFunc',
        type: 'function',
        signature: '() => void',
        start_line: 1,
        end_line: 2,
        is_exported: true,
      },
    ];
    const mockDeps: DependencyExtraction[] = [
      { source: 'test.ts', target: 'other.ts', type: 'import' },
    ];

    (mockIndexer.isAvailable as jest.Mock).mockResolvedValue(true);
    (mockIndexer.extractSymbols as jest.Mock).mockResolvedValue(mockSymbols);
    (mockIndexer.extractDeps as jest.Mock).mockResolvedValue(mockDeps);

    analyzer = createCodegraphAnalyzer({ rootDir: testDir }, mockIndexer);

    const filePath = path.join(testDir, 'test.ts');
    fs.writeFileSync(filePath, 'export const x = 1;'); // Actual content doesn't matter much with mock

    await analyzer.buildGraph([filePath]);

    expect(mockIndexer.isAvailable).toHaveBeenCalled();
    expect(mockIndexer.extractSymbols).toHaveBeenCalledWith(testDir, 'test.ts');

    const deps = analyzer.getDependencies(filePath);
    expect(deps).toBeDefined();
    expect(deps!.exports).toContain('injectedFunc');
    expect(deps!.imports[0].symbol).toBe('other.ts');
  });

  it('should fall back to local analysis when indexer is provided but not available', async () => {
    (mockIndexer.isAvailable as jest.Mock).mockResolvedValue(false);

    analyzer = createCodegraphAnalyzer({ rootDir: testDir }, mockIndexer);

    const filePath = path.join(testDir, 'test.ts');
    fs.writeFileSync(filePath, 'export const localX = 1;');

    await analyzer.buildGraph([filePath]);

    expect(mockIndexer.isAvailable).toHaveBeenCalled();
    expect(mockIndexer.extractSymbols).not.toHaveBeenCalled();

    const deps = analyzer.getDependencies(filePath);
    expect(deps).toBeDefined();
    expect(deps!.exports).toContain('localX');
  });

  it('should handle indexer errors by falling back to local analysis', async () => {
    (mockIndexer.isAvailable as jest.Mock).mockResolvedValue(true);
    (mockIndexer.extractSymbols as jest.Mock).mockRejectedValue(new Error('Indexer failed'));

    analyzer = createCodegraphAnalyzer({ rootDir: testDir }, mockIndexer);

    const filePath = path.join(testDir, 'test.ts');
    fs.writeFileSync(filePath, 'export const fallbackX = 1;');

    await analyzer.buildGraph([filePath]);

    // Should have tried indexer but fell back on error
    expect(mockIndexer.extractSymbols).toHaveBeenCalled();

    const deps = analyzer.getDependencies(filePath);
    expect(deps).toBeDefined();
    expect(deps!.exports).toContain('fallbackX');
  });
});
