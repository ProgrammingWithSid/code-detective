import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { AIProviderFactory, ClaudeProvider, OpenAIProvider } from '../src/ai-provider';
import { AIProviderError, CodeChunk, Config } from '../src/types';

jest.mock('openai');
jest.mock('@anthropic-ai/sdk');

describe('AIProvider', () => {
  const createMockChunks = (): CodeChunk[] => [
    {
      id: 'chunk1',
      name: 'function1',
      type: 'function',
      file: 'src/file.ts',
      startLine: 1,
      endLine: 10,
      content: 'function test() { return 42; }',
    },
  ];

  const createValidAIResponse = () =>
    JSON.stringify({
      bugs: [
        {
          severity: 'High',
          file: 'src/file.ts',
          line: 5,
          description: 'Issue found',
          fix: 'Fix it',
        },
      ],
      security: [],
      performance: [],
      code_quality: [],
      architecture: [],
      summary: {
        recommendation: 'REQUEST_CHANGES',
        top_issues: ['Issue found'],
      },
    });

  describe('OpenAIProvider', () => {
    let provider: OpenAIProvider;
    let mockCreateFn: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      mockCreateFn = jest.fn().mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
      });

      const mockOpenAI = {
        chat: {
          completions: {
            create: mockCreateFn,
          },
        },
      };

      (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(
        () => mockOpenAI as unknown as OpenAI
      );

      provider = new OpenAIProvider('test-key', 'gpt-4');
    });

    it('should review code and return parsed results', async () => {
      const chunks = createMockChunks();
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: createValidAIResponse() } }],
      });

      const result = await provider.reviewCode(chunks, ['rule1']);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].file).toBe('src/file.ts');
      expect(result.comments[0].line).toBe(5);
      expect(result.comments[0].severity).toBe('error');
      expect(result.summary).toContain('REQUEST_CHANGES');
    });

    it('should include global rules in prompt', async () => {
      const chunks = createMockChunks();
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: createValidAIResponse() } }],
      });

      await provider.reviewCode(chunks, ['Check security', 'Follow best practices']);

      const callArgs = mockCreateFn.mock.calls[0][0] as {
        messages: Array<{ content: string }>;
      };
      const prompt = callArgs.messages[1].content;

      expect(prompt).toContain('Check security');
      expect(prompt).toContain('Follow best practices');
    });

    it('should handle parsing errors gracefully', async () => {
      const chunks = createMockChunks();
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: 'Invalid JSON response' } }],
      });

      const result = await provider.reviewCode(chunks, []);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].body).toBe('Invalid JSON response');
      expect(result.summary).toContain('parsing failed');
    });

    it('should handle markdown-wrapped JSON', async () => {
      const chunks = createMockChunks();
      const wrappedResponse = '```json\n' + createValidAIResponse() + '\n```';
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: wrappedResponse } }],
      });

      const result = await provider.reviewCode(chunks, []);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].severity).toBe('error');
    });

    it('should map severity levels correctly', async () => {
      const chunks = createMockChunks();
      const response = JSON.stringify({
        bugs: [
          { severity: 'Critical', file: 'a.ts', line: 1, description: 'Critical' },
          { severity: 'High', file: 'a.ts', line: 2, description: 'High' },
          { severity: 'Medium', file: 'a.ts', line: 3, description: 'Medium' },
          { severity: 'Low', file: 'a.ts', line: 4, description: 'Low' },
          { severity: 'Nitpick', file: 'a.ts', line: 5, description: 'Nitpick' },
        ],
        security: [],
        performance: [],
        code_quality: [],
        architecture: [],
      });
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: response } }],
      });

      const result = await provider.reviewCode(chunks, []);

      expect(result.comments[0].severity).toBe('error'); // Critical
      expect(result.comments[1].severity).toBe('error'); // High
      expect(result.comments[2].severity).toBe('warning'); // Medium
      expect(result.comments[3].severity).toBe('suggestion'); // Low
      expect(result.comments[4].severity).toBe('info'); // Nitpick
    });

    it('should handle empty response', async () => {
      const chunks = createMockChunks();
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: '' } }],
      });

      const result = await provider.reviewCode(chunks, []);

      expect(result.comments).toHaveLength(1);
      expect(result.summary).toContain('parsing failed');
    });

    it('should include dependencies in prompt when present', async () => {
      const chunks: CodeChunk[] = [
        {
          ...createMockChunks()[0],
          dependencies: ['dep1', 'dep2'],
        },
      ];
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: createValidAIResponse() } }],
      });

      await provider.reviewCode(chunks, []);

      const callArgs = mockCreateFn.mock.calls[0][0] as {
        messages: Array<{ content: string }>;
      };
      const prompt = callArgs.messages[1].content;

      expect(prompt).toContain('dep1');
      expect(prompt).toContain('dep2');
    });
  });

  describe('ClaudeProvider', () => {
    let provider: ClaudeProvider;
    let mockCreateFn: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      mockCreateFn = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
      });

      const mockAnthropic = {
        messages: {
          create: mockCreateFn,
        },
      };

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
        () => mockAnthropic as unknown as Anthropic
      );

      provider = new ClaudeProvider('test-key', 'claude-3-5-sonnet-20241022');
    });

    it('should review code and return parsed results', async () => {
      const chunks = createMockChunks();
      mockCreateFn.mockResolvedValue({
        content: [{ type: 'text', text: createValidAIResponse() }],
      });

      const result = await provider.reviewCode(chunks, ['rule1']);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].file).toBe('src/file.ts');
    });

    it('should include global rules in prompt', async () => {
      const chunks = createMockChunks();
      mockCreateFn.mockResolvedValue({
        content: [{ type: 'text', text: createValidAIResponse() }],
      });

      await provider.reviewCode(chunks, ['Check security', 'Follow best practices']);

      const callArgs = mockCreateFn.mock.calls[0][0] as {
        messages: Array<{ content: string }>;
      };
      const prompt = callArgs.messages[0].content;

      expect(prompt).toContain('Check security');
      expect(prompt).toContain('Follow best practices');
    });

    it('should handle non-text response content', async () => {
      const chunks = createMockChunks();
      mockCreateFn.mockResolvedValue({
        content: [{ type: 'image', source: {} }],
      });

      const result = await provider.reviewCode(chunks, []);

      expect(result.summary).toContain('parsing failed');
    });
  });

  describe('AIProviderFactory', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(
        () => ({ chat: { completions: { create: jest.fn() } } }) as unknown as OpenAI
      );

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
        () => ({ messages: { create: jest.fn() } }) as unknown as Anthropic
      );
    });

    it('should create OpenAI provider', () => {
      const config: Config = {
        aiProvider: 'openai',
        openai: {
          apiKey: 'test-key',
          model: 'gpt-4',
        },
        globalRules: [],
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
      };

      const provider = AIProviderFactory.create(config);
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should create Claude provider', () => {
      const config: Config = {
        aiProvider: 'claude',
        claude: {
          apiKey: 'test-key',
          model: 'claude-3-5-sonnet-20241022',
        },
        globalRules: [],
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
      };

      const provider = AIProviderFactory.create(config);
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });

    it('should throw error if OpenAI API key is missing', () => {
      const config: Config = {
        aiProvider: 'openai',
        globalRules: [],
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
      };

      expect(() => AIProviderFactory.create(config)).toThrow(AIProviderError);
      expect(() => AIProviderFactory.create(config)).toThrow('OpenAI API key is required');
    });

    it('should throw error if Claude API key is missing', () => {
      const config: Config = {
        aiProvider: 'claude',
        globalRules: [],
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
      };

      expect(() => AIProviderFactory.create(config)).toThrow(AIProviderError);
      expect(() => AIProviderFactory.create(config)).toThrow('Claude API key is required');
    });
  });
});
