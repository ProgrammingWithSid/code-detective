import { PRReviewer } from '../src/reviewer';
import { Config, ChangedFile, ReviewComment } from '../src/types';
import { GitService } from '../src/git';
import { ChunkService } from '../src/chunker';
import { AIProviderInterface } from '../src/ai-provider';
import { PRCommentService } from '../src/pr-comments';

jest.mock('../src/git');
jest.mock('../src/chunker');
jest.mock('../src/ai-provider');
jest.mock('../src/pr-comments');

describe('PRReviewer', () => {
  let reviewer: PRReviewer;
  let mockConfig: Config;
  let mockGitService: jest.Mocked<GitService>;
  let mockChunkService: jest.Mocked<ChunkService>;
  let mockAIProvider: jest.Mocked<AIProviderInterface>;
  let mockPRCommentService: jest.Mocked<PRCommentService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      aiProvider: 'openai',
      openai: {
        apiKey: 'test-key',
        model: 'gpt-4',
      },
      globalRules: ['rule1', 'rule2'],
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

    mockGitService = {
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      getChangedFiles: jest.fn(),
      getCurrentBranch: jest.fn().mockResolvedValue('feature-branch'),
    } as any;

    mockChunkService = {
      chunkChangedFiles: jest.fn(),
      chunkFile: jest.fn(),
      chunkFileByRange: jest.fn(),
    } as any;

    mockAIProvider = {
      reviewCode: jest.fn(),
    } as any;

    mockPRCommentService = {
      postComments: jest.fn().mockResolvedValue(undefined),
      postReviewSummary: jest.fn().mockResolvedValue(undefined),
    } as any;

    (GitService as jest.MockedClass<typeof GitService>).mockImplementation(() => mockGitService);
    (ChunkService as jest.MockedClass<typeof ChunkService>).mockImplementation(() => mockChunkService);

    // Mock AIProviderFactory
    const { AIProviderFactory } = require('../src/ai-provider');
    jest.spyOn(AIProviderFactory, 'create').mockReturnValue(mockAIProvider);

    // Mock PRCommentServiceFactory
    const { PRCommentServiceFactory } = require('../src/pr-comments');
    jest.spyOn(PRCommentServiceFactory, 'create').mockReturnValue(mockPRCommentService);

    reviewer = new PRReviewer(mockConfig);
  });

  describe('reviewPR', () => {
    it('should complete full review workflow', async () => {
      const changedFiles: ChangedFile[] = [
        {
          path: 'src/file.ts',
          status: 'modified',
          changedLines: new Set([10, 11, 12]),
        },
      ];

      const mockChunks = [
        {
          id: 'chunk1',
          name: 'function1',
          type: 'function',
          file: 'src/file.ts',
          startLine: 5,
          endLine: 15,
          content: 'code content',
        },
      ];

      const mockReviewResult = {
        comments: [
          {
            file: 'src/file.ts',
            line: 10,
            body: 'Issue found',
            severity: 'error' as const,
          },
          {
            file: 'src/file.ts',
            line: 5,
            body: 'This is on unchanged line',
            severity: 'warning' as const,
          },
        ],
        summary: 'Review completed',
        stats: {
          errors: 1,
          warnings: 1,
          suggestions: 0,
        },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks as any);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewPR('feature-branch', 'main', true);

      expect(mockGitService.checkoutBranch).toHaveBeenCalledWith('feature-branch');
      expect(mockGitService.getChangedFiles).toHaveBeenCalledWith('main', 'feature-branch');
      expect(mockChunkService.chunkChangedFiles).toHaveBeenCalledWith(changedFiles, 'feature-branch');
      expect(mockAIProvider.reviewCode).toHaveBeenCalledWith(mockChunks, ['rule1', 'rule2']);

      // Should filter comments to only changed lines
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].line).toBe(10);
      expect(result.stats.errors).toBe(1);
      expect(result.stats.warnings).toBe(0);

      expect(mockPRCommentService.postComments).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ line: 10 })]),
        123
      );
    });

    it('should return early if no files changed', async () => {
      mockGitService.getChangedFiles.mockResolvedValue([]);

      const result = await reviewer.reviewPR('feature-branch', 'main', true);

      expect(result.comments).toHaveLength(0);
      expect(result.summary).toContain('No files changed');
      expect(mockChunkService.chunkChangedFiles).not.toHaveBeenCalled();
    });

    it('should return early if no chunks generated', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/file.ts', status: 'modified', changedLines: new Set() },
      ];

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue([]);

      const result = await reviewer.reviewPR('feature-branch', 'main', true);

      expect(result.comments).toHaveLength(0);
      expect(result.summary).toContain('No code chunks');
    });

    it('should skip posting comments if postComments is false', async () => {
      const changedFiles: ChangedFile[] = [
        {
          path: 'src/file.ts',
          status: 'modified',
          changedLines: new Set([10]),
        },
      ];

      const mockChunks = [{ id: 'chunk1', file: 'src/file.ts', startLine: 1, endLine: 10, content: 'code' }];
      const mockReviewResult = {
        comments: [{ file: 'src/file.ts', line: 10, body: 'Issue', severity: 'error' as const }],
        summary: 'Review',
        stats: { errors: 1, warnings: 0, suggestions: 0 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks as any);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      await reviewer.reviewPR('feature-branch', 'main', false);

      expect(mockPRCommentService.postComments).not.toHaveBeenCalled();
    });

    it('should filter comments to only changed lines', async () => {
      const changedFiles: ChangedFile[] = [
        {
          path: 'src/file.ts',
          status: 'modified',
          changedLines: new Set([10, 11]),
        },
      ];

      const mockChunks = [{ id: 'chunk1', file: 'src/file.ts', startLine: 1, endLine: 20, content: 'code' }];
      const mockReviewResult = {
        comments: [
          { file: 'src/file.ts', line: 10, body: 'Changed line', severity: 'error' as const },
          { file: 'src/file.ts', line: 5, body: 'Unchanged line', severity: 'warning' as const },
          { file: 'src/file.ts', line: 11, body: 'Changed line', severity: 'info' as const },
        ],
        summary: 'Review',
        stats: { errors: 1, warnings: 1, suggestions: 1 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks as any);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewPR('feature-branch', 'main', true);

      expect(result.comments).toHaveLength(2);
      expect(result.comments.map(c => c.line)).toEqual([10, 11]);
      expect(result.stats.errors).toBe(1);
      expect(result.stats.warnings).toBe(0);
      expect(result.stats.suggestions).toBe(1);
    });

    it('should include all comments for added files', async () => {
      const changedFiles: ChangedFile[] = [
        {
          path: 'src/new-file.ts',
          status: 'added',
          changedLines: new Set([1, 2, 3]),
        },
      ];

      const mockChunks = [{ id: 'chunk1', file: 'src/new-file.ts', startLine: 1, endLine: 10, content: 'code' }];
      const mockReviewResult = {
        comments: [
          { file: 'src/new-file.ts', line: 1, body: 'Comment', severity: 'error' as const },
          { file: 'src/new-file.ts', line: 5, body: 'Comment', severity: 'warning' as const },
        ],
        summary: 'Review',
        stats: { errors: 1, warnings: 1, suggestions: 0 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks as any);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewPR('feature-branch', 'main', true);

      expect(result.comments).toHaveLength(2);
    });
  });

  describe('reviewFile', () => {
    it('should review a file with range', async () => {
      const mockChunk = {
        id: 'chunk1',
        file: 'src/file.ts',
        startLine: 10,
        endLine: 50,
        content: 'code',
      };

      const mockReviewResult = {
        comments: [{ file: 'src/file.ts', line: 15, body: 'Issue', severity: 'error' as const }],
        summary: 'Review',
        stats: { errors: 1, warnings: 0, suggestions: 0 },
      };

      mockChunkService.chunkFileByRange.mockResolvedValue(mockChunk as any);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewFile('src/file.ts', 'feature-branch', 10, 50);

      expect(mockChunkService.chunkFileByRange).toHaveBeenCalledWith('src/file.ts', 10, 50, 'feature-branch');
      expect(result.comments).toHaveLength(1);
    });

    it('should review entire file if no range specified', async () => {
      const mockChunks = [{ id: 'chunk1', file: 'src/file.ts', startLine: 1, endLine: 10, content: 'code' }];
      const mockReviewResult = {
        comments: [],
        summary: 'Review',
        stats: { errors: 0, warnings: 0, suggestions: 0 },
      };

      mockChunkService.chunkFile.mockResolvedValue(mockChunks as any);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      await reviewer.reviewFile('src/file.ts', 'feature-branch');

      expect(mockChunkService.chunkFile).toHaveBeenCalledWith('src/file.ts', 'feature-branch');
    });
  });
});
