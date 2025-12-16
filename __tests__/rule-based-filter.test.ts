import { RuleBasedFilter } from '../src/utils/rule-based-filter';
import { CodeChunk } from '../src/types';

describe('RuleBasedFilter', () => {
  let filter: RuleBasedFilter;

  beforeEach(() => {
    filter = new RuleBasedFilter();
  });

  describe('analyzeChunks', () => {
    it('should detect console.log statements', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 3,
          content: 'function test() {\n  console.log("debug");\n}',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const consoleIssue = issues.find((i) => i.rule === 'no-console');

      expect(consoleIssue).toBeDefined();
      expect(consoleIssue?.severity).toBe('warning');
      expect(consoleIssue?.line).toBe(2);
    });

    it('should detect TODO comments', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 2,
          content: 'function test() {\n  // TODO: Fix this\n}',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const todoIssue = issues.find((i) => i.rule === 'no-todo');

      expect(todoIssue).toBeDefined();
      expect(todoIssue?.severity).toBe('info');
    });

    it('should detect debugger statements', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 3,
          content: 'function test() {\n  debugger;\n}',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const debuggerIssue = issues.find((i) => i.rule === 'no-debugger');

      expect(debuggerIssue).toBeDefined();
      expect(debuggerIssue?.severity).toBe('error');
    });

    it('should detect empty catch blocks', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 3,
          content: 'try {\n} catch (e) {}\n',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const catchIssue = issues.find((i) => i.rule === 'no-empty-catch');

      expect(catchIssue).toBeDefined();
      expect(catchIssue?.severity).toBe('warning');
    });

    it('should detect loose equality (==)', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 2,
          content: 'if (x == y) {}\n',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const eqIssue = issues.find((i) => i.rule === 'eqeqeq' && i.message.includes('==='));

      expect(eqIssue).toBeDefined();
      expect(eqIssue?.severity).toBe('warning');
      expect(eqIssue?.fix).toContain('===');
    });

    it('should detect var declarations', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 2,
          content: 'var x = 1;\n',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const varIssue = issues.find((i) => i.rule === 'no-var');

      expect(varIssue).toBeDefined();
      expect(varIssue?.severity).toBe('suggestion');
      expect(varIssue?.fix).toContain('const');
    });

    it('should detect hardcoded secrets', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 2,
          content: 'const apiKey = "sk-1234567890";\n',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const secretIssue = issues.find((i) => i.rule === 'no-hardcoded-secret');

      expect(secretIssue).toBeDefined();
      expect(secretIssue?.severity).toBe('error');
      expect(secretIssue?.category).toBe('security');
    });

    it('should detect eval() usage', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 2,
          content: 'eval("some code");\n',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const evalIssue = issues.find((i) => i.rule === 'no-eval');

      expect(evalIssue).toBeDefined();
      expect(evalIssue?.severity).toBe('error');
      expect(evalIssue?.category).toBe('security');
    });

    it('should detect innerHTML usage', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 2,
          content: 'element.innerHTML = userInput;\n',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      const innerHTMLIssue = issues.find((i) => i.rule === 'no-innerhtml');

      expect(innerHTMLIssue).toBeDefined();
      expect(innerHTMLIssue?.severity).toBe('warning');
      expect(innerHTMLIssue?.category).toBe('security');
    });

    it('should handle chunks without content', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: '',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      expect(issues.length).toBe(0);
    });

    it('should detect multiple issues in same chunk', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 4,
          content: 'var x = 1;\nif (x == 2) {}\nconsole.log(x);\n',
        },
      ];

      const issues = filter.analyzeChunks(chunks);
      expect(issues.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('convertToReviewComments', () => {
    it('should convert issues to review comments', () => {
      const issues = filter.analyzeChunks([
        {
          id: '1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 2,
          content: 'console.log("test");\n',
        },
      ]);

      const comments = filter.convertToReviewComments(issues);

      expect(comments.length).toBe(issues.length);
      expect(comments[0].file).toBe('test.ts');
      expect(comments[0].severity).toBe('warning');
      expect(comments[0].rule).toBe('no-console');
    });
  });

  describe('filterRuleBasedIssues', () => {
    it('should separate rule-based and AI-only issues', () => {
      const allIssues = [
        {
          file: 'test.ts',
          line: 1,
          body: 'Console statement',
          severity: 'warning' as const,
          rule: 'no-console',
        },
        {
          file: 'test.ts',
          line: 5,
          body: 'Complex logic issue',
          severity: 'error' as const,
        },
      ];

      const ruleBasedIssues = [
        {
          file: 'test.ts',
          line: 1,
          body: 'Console statement',
          severity: 'warning' as const,
          rule: 'no-console',
        },
      ];

      const result = filter.filterRuleBasedIssues(allIssues, ruleBasedIssues);

      expect(result.ruleBased.length).toBe(1);
      expect(result.aiOnly.length).toBe(1);
    });
  });
});
