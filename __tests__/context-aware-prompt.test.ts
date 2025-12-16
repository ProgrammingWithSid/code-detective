import { ContextAwarePromptBuilder, ReviewContext } from '../src/utils/context-aware-prompt';
import { CodeChunk } from '../src/types';

describe('ContextAwarePromptBuilder', () => {
  let builder: ContextAwarePromptBuilder;

  beforeEach(() => {
    builder = new ContextAwarePromptBuilder();
  });

  describe('buildPrompt', () => {
    it('should build base prompt', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const prompt = builder.buildPrompt(chunks, [], {});

      expect(prompt).toContain('Code Review Request');
      expect(prompt).toContain('Bugs');
      expect(prompt).toContain('Security');
      expect(prompt).toContain('Performance');
    });

    it('should add React framework context', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'Component',
          type: 'function',
          file: 'Component.tsx',
          startLine: 1,
          endLine: 10,
          content: 'function Component() {}',
        },
      ];

      const context: ReviewContext = { framework: 'react' };
      const prompt = builder.buildPrompt(chunks, [], context);

      expect(prompt).toContain('React-Specific Guidelines');
      expect(prompt).toContain('useEffect');
      expect(prompt).toContain('React.memo');
    });

    it('should add Vue framework context', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'Component',
          type: 'function',
          file: 'Component.vue',
          startLine: 1,
          endLine: 10,
          content: 'export default {}',
        },
      ];

      const context: ReviewContext = { framework: 'vue' };
      const prompt = builder.buildPrompt(chunks, [], context);

      expect(prompt).toContain('Vue-Specific Guidelines');
      expect(prompt).toContain('ref');
      expect(prompt).toContain('reactive');
    });

    it('should add file type context', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const context: ReviewContext = { fileTypes: ['typescript', 'test'] };
      const prompt = builder.buildPrompt(chunks, [], context);

      expect(prompt).toContain('TypeScript Guidelines');
      expect(prompt).toContain('Test File Guidelines');
    });

    it('should add dependency context', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const context: ReviewContext = {
        dependencies: [
          { name: 'react', source: 'react' },
          { name: 'axios', source: 'axios' },
        ],
      };
      const prompt = builder.buildPrompt(chunks, [], context);

      expect(prompt).toContain('Dependency Context');
      expect(prompt).toContain('react');
      expect(prompt).toContain('axios');
    });

    it('should add codebase patterns', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const context: ReviewContext = {
        codebasePatterns: ['Use async/await', 'Prefer const over let'],
      };
      const prompt = builder.buildPrompt(chunks, [], context);

      expect(prompt).toContain('Codebase-Specific Patterns');
      expect(prompt).toContain('async/await');
      expect(prompt).toContain('const over let');
    });

    it('should add global rules', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const globalRules = ['Rule 1', 'Rule 2'];
      const prompt = builder.buildPrompt(chunks, globalRules, {});

      expect(prompt).toContain('Additional Rules to Check');
      expect(prompt).toContain('Rule 1');
      expect(prompt).toContain('Rule 2');
    });

    it('should add chunks to prompt', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 5,
          endLine: 15,
          content: 'function test() { return 42; }',
          dependencies: ['dep1', 'dep2'],
        },
      ];

      const prompt = builder.buildPrompt(chunks, [], {});

      expect(prompt).toContain('testFunction');
      expect(prompt).toContain('test.ts');
      expect(prompt).toContain('5-15');
      expect(prompt).toContain('function test()');
      expect(prompt).toContain('dep1');
    });
  });

  describe('extractContext', () => {
    it('should detect React framework from .tsx files', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'Component',
          type: 'function',
          file: 'Component.tsx',
          startLine: 1,
          endLine: 10,
          content: 'function Component() {}',
        },
      ];

      const context = ContextAwarePromptBuilder.extractContext(chunks);

      expect(context.framework).toBe('react');
      expect(context.fileTypes).toContain('typescript');
    });

    it('should detect Vue framework from .vue files', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'Component',
          type: 'function',
          file: 'Component.vue',
          startLine: 1,
          endLine: 10,
          content: 'export default {}',
        },
      ];

      const context = ContextAwarePromptBuilder.extractContext(chunks);

      expect(context.framework).toBe('vue');
    });

    it('should detect test files', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.spec.ts',
          startLine: 1,
          endLine: 10,
          content: 'describe("test", () => {})',
        },
      ];

      const context = ContextAwarePromptBuilder.extractContext(chunks);

      expect(context.fileTypes).toContain('test');
    });

    it('should detect API files', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'handler',
          type: 'function',
          file: 'api/handler.ts',
          startLine: 1,
          endLine: 10,
          content: 'function handler() {}',
        },
      ];

      const context = ContextAwarePromptBuilder.extractContext(chunks);

      expect(context.fileTypes).toContain('api');
    });

    it('should extract dependencies', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          dependencies: ['react', 'axios'],
        },
      ];

      const context = ContextAwarePromptBuilder.extractContext(chunks);

      expect(context.dependencies).toBeDefined();
      expect(context.dependencies!.length).toBeGreaterThan(0);
    });

    it('should limit dependencies to 20', () => {
      const chunks: CodeChunk[] = Array.from({ length: 30 }, (_, i) => ({
        id: String(i),
        name: `test${i}`,
        type: 'function',
        file: `test${i}.ts`,
        startLine: 1,
        endLine: 10,
        content: `function test${i}() {}`,
        dependencies: [`dep${i}`],
      }));

      const context = ContextAwarePromptBuilder.extractContext(chunks);

      expect(context.dependencies!.length).toBeLessThanOrEqual(20);
    });

    it('should handle empty chunks', () => {
      const context = ContextAwarePromptBuilder.extractContext([]);

      expect(context.framework).toBe('none');
      expect(context.fileTypes).toEqual([]);
      expect(context.dependencies).toEqual([]);
    });
  });
});
