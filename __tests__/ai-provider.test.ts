import { OpenAIProvider, ClaudeProvider, AIProviderFactory } from '../src/ai-provider';
import { CodeChunk, Config } from '../src/types';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

jest.mock('openai');
jest.mock('@anthropic-ai/sdk');

describe('AIProvider', () => {
  describe('OpenAIProvider', () => {
    let provider: OpenAIProvider;
    let mockOpenAI: any;
    let mockCreateFn: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      mockCreateFn = jest.fn().mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
      });
      mockOpenAI = {
        chat: {
          completions: {
            create: mockCreateFn,
          },
        },
      };

      (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

      provider = new OpenAIProvider('test-key', 'gpt-4');
    });

    it('should review code and return parsed results', async () => {
      const chunks: CodeChunk[] = [
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

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Found issues',
                comments: [
                  {
                    file: 'src/file.ts',
                    line: 5,
                    severity: 'error',
                    body: 'Issue found',
                  },
                ],
              }),
            },
          },
        ],
      };

      mockCreateFn.mockResolvedValue(mockResponse);

      const result = await provider.reviewCode(chunks, ['rule1']);

      expect(result.summary).toBe('Found issues');
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].file).toBe('src/file.ts');
      expect(result.comments[0].line).toBe(5);
    });

    it('should include global rules in prompt', async () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'function1',
          type: 'function',
          file: 'src/file.ts',
          startLine: 1,
          endLine: 10,
          content: 'code',
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Review',
                comments: [],
              }),
            },
          },
        ],
      };

      mockCreateFn.mockResolvedValue(mockResponse);

      await provider.reviewCode(chunks, ['Check security', 'Follow best practices']);

      const callArgs = mockCreateFn.mock.calls[0][0];
      const prompt = callArgs.messages[1].content as string;

      expect(prompt).toContain('Check security');
      expect(prompt).toContain('Follow best practices');
    });

    it('should handle parsing errors gracefully', async () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'function1',
          type: 'function',
          file: 'src/file.ts',
          startLine: 1,
          endLine: 10,
          content: 'code',
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Invalid JSON response',
            },
          },
        ],
      };

      mockCreateFn.mockResolvedValue(mockResponse);

      const result = await provider.reviewCode(chunks, []);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].body).toBe('Invalid JSON response');
    });
  });

  describe('ClaudeProvider', () => {
    let provider: ClaudeProvider;
    let mockAnthropic: any;
    let mockCreateFn: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      mockCreateFn = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
      });
      mockAnthropic = {
        messages: {
          create: mockCreateFn,
        },
      };

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => mockAnthropic);

      provider = new ClaudeProvider('test-key', 'claude-3-5-sonnet-20241022');
    });

    it('should review code and return parsed results', async () => {
      const chunks: CodeChunk[] = [
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

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Found issues',
              comments: [
                {
                  file: 'src/file.ts',
                  line: 5,
                  severity: 'error',
                  body: 'Issue found',
                },
              ],
            }),
          },
        ],
      };

      mockCreateFn.mockResolvedValue(mockResponse);

      const result = await provider.reviewCode(chunks, ['rule1']);

      expect(result.summary).toBe('Found issues');
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].file).toBe('src/file.ts');
    });

    it('should include global rules in prompt', async () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'function1',
          type: 'function',
          file: 'src/file.ts',
          startLine: 1,
          endLine: 10,
          content: 'code',
        },
      ];

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Review',
              comments: [],
            }),
          },
        ],
      };

      mockCreateFn.mockResolvedValue(mockResponse);

      await provider.reviewCode(chunks, ['Check security', 'Follow best practices']);

      const callArgs = mockCreateFn.mock.calls[0][0];
      const prompt = callArgs.messages[0].content as string;

      expect(prompt).toContain('Check security');
      expect(prompt).toContain('Follow best practices');
    });
  });

  describe('AIProviderFactory', () => {
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

    it('should throw error for unsupported provider', () => {
      const config = {
        aiProvider: 'unsupported',
      } as any;

      expect(() => AIProviderFactory.create(config)).toThrow();
    });
  });
});
