/**
 * Tests for Summary Builder and Diagram Generator
 */

import { SummaryBuilder, DiagramGenerator } from '../src/feedback';
import { ChangedFile, CodeChunk, Config } from '../src/types';
import { FileChange } from '../src/types/summary';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockConfig: Config = {
  aiProvider: 'openai',
  openai: { apiKey: 'test-key', model: 'gpt-4' },
  repository: { owner: 'test', repo: 'test', baseBranch: 'main' },
  pr: { number: 1 },
  globalRules: [],
};

const createMockChangedFiles = (): ChangedFile[] => [
  { path: 'src/utils/helper.ts', status: 'modified', additions: 50, deletions: 10 },
  { path: 'src/utils/api.ts', status: 'added', additions: 100, deletions: 0 },
  { path: 'src/components/Button.tsx', status: 'modified', additions: 20, deletions: 5 },
  { path: '__tests__/helper.test.ts', status: 'added', additions: 80, deletions: 0 },
  { path: 'package.json', status: 'modified', additions: 2, deletions: 1 },
  { path: 'README.md', status: 'modified', additions: 15, deletions: 5 },
];

const createMockChunks = (): CodeChunk[] => [
  {
    id: '1',
    name: 'fetchData',
    type: 'function',
    file: 'src/utils/api.ts',
    startLine: 1,
    endLine: 20,
    content: 'async function fetchData() { ... }',
    dependencies: ['axios'],
  },
  {
    id: '2',
    name: 'parseResponse',
    type: 'function',
    file: 'src/utils/helper.ts',
    startLine: 10,
    endLine: 30,
    content: 'function parseResponse() { ... }',
    dependencies: ['fetchData'],
  },
];

const createMockFileChanges = (): FileChange[] => [
  {
    path: 'src/utils/helper.ts',
    status: 'modified',
    additions: 50,
    deletions: 10,
    language: 'TypeScript',
  },
  {
    path: 'src/utils/api.ts',
    status: 'added',
    additions: 100,
    deletions: 0,
    language: 'TypeScript',
  },
  {
    path: 'src/components/Button.tsx',
    status: 'modified',
    additions: 20,
    deletions: 5,
    language: 'TypeScript React',
  },
];

// ============================================================================
// SummaryBuilder Tests
// ============================================================================

describe('SummaryBuilder', () => {
  let builder: SummaryBuilder;

  beforeEach(() => {
    builder = new SummaryBuilder(mockConfig);
  });

  describe('buildSummary', () => {
    it('should build a complete PR summary', async () => {
      const changedFiles = createMockChangedFiles();
      const chunks = createMockChunks();

      const summary = await builder.buildSummary(changedFiles, chunks, {
        includeInsights: false,
        includeDiagrams: false,
      });

      expect(summary.title).toContain('PR Summary');
      expect(summary.stats.totalFiles).toBe(6);
      expect(summary.stats.totalAdditions).toBe(267);
      expect(summary.stats.totalDeletions).toBe(21);
      expect(summary.changeGroups.length).toBeGreaterThan(0);
      expect(summary.risk).toBeDefined();
      expect(summary.recommendation).toBeDefined();
    });

    it('should calculate correct statistics', async () => {
      const changedFiles = createMockChangedFiles();
      const summary = await builder.buildSummary(changedFiles, [], {
        includeInsights: false,
      });

      expect(summary.stats.filesAdded).toBe(2);
      expect(summary.stats.filesModified).toBe(4);
      expect(summary.stats.filesDeleted).toBe(0);
    });

    it('should categorize files correctly', async () => {
      const changedFiles = createMockChangedFiles();
      const summary = await builder.buildSummary(changedFiles, [], {
        includeInsights: false,
      });

      // Find test category
      const testGroup = summary.changeGroups.find((g) => g.category === 'test');
      expect(testGroup).toBeDefined();
      expect(testGroup?.files.some((f) => f.path.includes('test'))).toBe(true);

      // Find docs category
      const docsGroup = summary.changeGroups.find((g) => g.category === 'docs');
      expect(docsGroup).toBeDefined();
      expect(docsGroup?.files.some((f) => f.path.includes('README'))).toBe(true);

      // Find config/dependency category (package.json is categorized as config or dependency)
      const configOrDepGroup = summary.changeGroups.find(
        (g) => g.category === 'dependency' || g.category === 'config'
      );
      expect(configOrDepGroup).toBeDefined();
    });

    it('should assess risk correctly for large changes', async () => {
      const largeChanges: ChangedFile[] = Array.from({ length: 15 }, (_, i) => ({
        path: `src/file${i}.ts`,
        status: 'modified' as const,
        additions: 50,
        deletions: 10,
      }));

      const summary = await builder.buildSummary(largeChanges, [], {
        includeInsights: false,
      });

      // Should detect large_change and many_files risk factors
      expect(summary.risk.score).toBeGreaterThan(0);
      expect(summary.risk.factors.some((f) => f.name === 'many_files' && f.detected)).toBe(true);
      expect(summary.risk.factors.some((f) => f.name === 'large_change' && f.detected)).toBe(true);
    });

    it('should detect security-sensitive changes', async () => {
      const securityChanges: ChangedFile[] = [
        { path: 'src/auth/login.ts', status: 'modified', additions: 20, deletions: 5 },
        { path: 'src/utils/password.ts', status: 'modified', additions: 10, deletions: 2 },
      ];

      const summary = await builder.buildSummary(securityChanges, [], {
        includeInsights: false,
      });

      expect(summary.risk.factors.some((f) => f.name === 'security_sensitive' && f.detected)).toBe(
        true
      );
    });

    it('should detect missing tests', async () => {
      const noTestChanges: ChangedFile[] = [
        { path: 'src/utils/helper.ts', status: 'modified', additions: 50, deletions: 10 },
      ];

      const summary = await builder.buildSummary(noTestChanges, [], {
        includeInsights: false,
      });

      expect(summary.risk.factors.some((f) => f.name === 'no_tests' && f.detected)).toBe(true);
    });
  });

  describe('buildWalkthrough', () => {
    it('should build a PR walkthrough with sections', async () => {
      const changedFiles = createMockChangedFiles();
      const chunks = createMockChunks();

      const walkthrough = await builder.buildWalkthrough(changedFiles, chunks, {
        includeInsights: false,
        includeDiagrams: true,
      });

      expect(walkthrough.title).toBeDefined();
      expect(walkthrough.overview).toBeDefined();
      expect(walkthrough.sections.length).toBeGreaterThan(0);
    });

    it('should include file tree diagram when enabled', async () => {
      const changedFiles = createMockChangedFiles();

      const walkthrough = await builder.buildWalkthrough(changedFiles, [], {
        includeInsights: false,
        includeDiagrams: true,
      });

      expect(walkthrough.fileTreeDiagram).toBeDefined();
      expect(walkthrough.fileTreeDiagram).toContain('mermaid');
    });
  });

  describe('formatAsMarkdown', () => {
    it('should format summary as valid markdown', async () => {
      const changedFiles = createMockChangedFiles();
      const summary = await builder.buildSummary(changedFiles, [], {
        includeInsights: false,
      });

      const markdown = builder.formatAsMarkdown(summary);

      expect(markdown).toContain('## 📋');
      expect(markdown).toContain('### 📊 Statistics');
      expect(markdown).toContain('| Metric | Count |');
      expect(markdown).toContain('### 📁 Changes by Category');
      expect(markdown).toContain('### 🎯 Recommendation');
    });

    it('should include collapsible sections when enabled', async () => {
      const changedFiles = createMockChangedFiles();
      const summary = await builder.buildSummary(changedFiles, [], {
        includeInsights: false,
      });

      const markdown = builder.formatAsMarkdown(summary, { collapsible: true });

      expect(markdown).toContain('<details>');
      expect(markdown).toContain('</details>');
    });

    it('should include risk assessment when enabled', async () => {
      const changedFiles = createMockChangedFiles();
      const summary = await builder.buildSummary(changedFiles, [], {
        includeInsights: false,
      });

      const markdown = builder.formatAsMarkdown(summary, { includeRisk: true });

      expect(markdown).toContain('Risk Assessment');
      expect(markdown).toContain('Level:');
    });
  });
});

// ============================================================================
// DiagramGenerator Tests
// ============================================================================

describe('DiagramGenerator', () => {
  let generator: DiagramGenerator;

  beforeEach(() => {
    generator = new DiagramGenerator();
  });

  describe('generateFileTree', () => {
    it('should generate a file tree mermaid diagram', () => {
      const files = createMockFileChanges();
      const diagram = generator.generateFileTree(files);

      expect(diagram).toContain('```mermaid');
      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('root');
      expect(diagram).toContain('```');
    });

    it('should return empty string for empty files', () => {
      const diagram = generator.generateFileTree([]);
      expect(diagram).toBe('');
    });

    it('should show correct status indicators', () => {
      const files: FileChange[] = [
        { path: 'added.ts', status: 'added', additions: 10, deletions: 0, language: 'TypeScript' },
        {
          path: 'modified.ts',
          status: 'modified',
          additions: 5,
          deletions: 2,
          language: 'TypeScript',
        },
        {
          path: 'deleted.ts',
          status: 'deleted',
          additions: 0,
          deletions: 10,
          language: 'TypeScript',
        },
      ];

      const diagram = generator.generateFileTree(files);

      expect(diagram).toContain('classDef added');
      expect(diagram).toContain('classDef modified');
      expect(diagram).toContain('classDef deleted');
    });
  });

  describe('generateFlowchart', () => {
    it('should generate a flowchart diagram', () => {
      const files = createMockFileChanges();
      const diagram = generator.generateFlowchart(files);

      expect(diagram).toContain('```mermaid');
      expect(diagram).toContain('flowchart TB');
      expect(diagram).toContain('subgraph');
      expect(diagram).toContain('```');
    });

    it('should group files by directory', () => {
      const files = createMockFileChanges();
      const diagram = generator.generateFlowchart(files);

      expect(diagram).toContain('src_utils');
      expect(diagram).toContain('src_components');
    });

    it('should respect maxNodes option', () => {
      const manyFiles = Array.from({ length: 50 }, (_, i) => ({
        path: `src/file${i}.ts`,
        status: 'modified' as const,
        additions: 10,
        deletions: 2,
        language: 'TypeScript',
      }));

      const diagram = generator.generateFlowchart(manyFiles, { maxNodes: 5 });

      // Should only include 5 files (each file appears twice in the diagram - once in node, once in stats)
      const fileMatches = diagram.match(/file\d+\.ts/g) || [];
      const uniqueFiles = new Set(fileMatches.map((f) => f.replace('.ts', '')));
      expect(uniqueFiles.size).toBeLessThanOrEqual(5);
    });
  });

  describe('generateDependency', () => {
    it('should generate a dependency graph', () => {
      const chunks = createMockChunks();
      const diagram = generator.generateDependency(chunks);

      expect(diagram).toContain('```mermaid');
      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('-->');
      expect(diagram).toContain('```');
    });

    it('should return empty string for empty chunks', () => {
      const diagram = generator.generateDependency([]);
      expect(diagram).toBe('');
    });
  });

  describe('generate', () => {
    it('should route to correct generator based on type', () => {
      const files = createMockFileChanges();
      const chunks = createMockChunks();

      const fileTree = generator.generate('fileTree', files);
      expect(fileTree).toContain('graph LR');

      const flowchart = generator.generate('flowchart', files);
      expect(flowchart).toContain('flowchart');

      const dependency = generator.generate('dependency', chunks);
      expect(dependency).toContain('graph');
    });
  });
});
