import { AIProviderInterface } from '../src/ai-provider';
import { ChunkService } from '../src/chunker';
import { GitService } from '../src/git';
import { PRCommentService } from '../src/pr-comments';
import { PRReviewer } from '../src/reviewer';
import { ChangedFile, CodeChunk, Config, ReviewResult } from '../src/types';

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

  const createConfig = (overrides: Partial<Config> = {}): Config => ({
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
    ...overrides,
  });

  const createChunk = (overrides: Partial<CodeChunk> = {}): CodeChunk => ({
    id: 'chunk1',
    name: 'function1',
    type: 'function',
    file: 'src/file.ts',
    startLine: 1,
    endLine: 20,
    content: 'code content',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = createConfig();

    mockGitService = {
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      getChangedFiles: jest.fn(),
      getCurrentBranch: jest.fn().mockResolvedValue('feature-branch'),
    } as unknown as jest.Mocked<GitService>;

    mockChunkService = {
      chunkChangedFiles: jest.fn(),
      chunkFile: jest.fn(),
      chunkFileByRange: jest.fn(),
    } as unknown as jest.Mocked<ChunkService>;

    mockAIProvider = {
      reviewCode: jest.fn(),
    } as unknown as jest.Mocked<AIProviderInterface>;

    mockPRCommentService = {
      postComments: jest.fn().mockResolvedValue(undefined),
      postReviewSummary: jest.fn().mockResolvedValue(undefined),
      postSuggestions: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PRCommentService>;

    (GitService as jest.MockedClass<typeof GitService>).mockImplementation(() => mockGitService);
    (ChunkService as jest.MockedClass<typeof ChunkService>).mockImplementation(
      () => mockChunkService
    );

    const { AIProviderFactory } = require('../src/ai-provider');
    jest.spyOn(AIProviderFactory, 'create').mockReturnValue(mockAIProvider);

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

      const mockChunks = [createChunk({ startLine: 5, endLine: 15 })];

      const mockReviewResult: ReviewResult = {
        comments: [
          { file: 'src/file.ts', line: 10, body: 'Issue found', severity: 'error' },
          { file: 'src/file.ts', line: 5, body: 'On unchanged line', severity: 'warning' },
        ],
        summary: 'Review completed',
        stats: { errors: 1, warnings: 1, suggestions: 0 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewPR('feature-branch', true);

      expect(mockGitService.checkoutBranch).toHaveBeenCalledWith('feature-branch');
      expect(mockGitService.getChangedFiles).toHaveBeenCalledWith('feature-branch', 'main');
      expect(mockChunkService.chunkChangedFiles).toHaveBeenCalledWith(
        changedFiles,
        'feature-branch'
      );
      expect(mockAIProvider.reviewCode).toHaveBeenCalledWith(mockChunks, ['rule1', 'rule2']);

      // Should filter comments to only changed lines within chunk range
      expect(result.comments).toHaveLength(2); // Both within chunk range (5-15)
      expect(result.stats.errors).toBe(1);
      expect(result.stats.warnings).toBe(1);
    });

    it('should return early if no files changed', async () => {
      mockGitService.getChangedFiles.mockResolvedValue([]);

      const result = await reviewer.reviewPR('feature-branch', true);

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

      const result = await reviewer.reviewPR('feature-branch', true);

      expect(result.comments).toHaveLength(0);
      expect(result.summary).toContain('No code chunks');
    });

    it('should skip posting comments if postComments is false', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/file.ts', status: 'modified', changedLines: new Set([10]) },
      ];

      const mockChunks = [createChunk()];
      const mockReviewResult: ReviewResult = {
        comments: [{ file: 'src/file.ts', line: 10, body: 'Issue', severity: 'error' }],
        summary: 'Review',
        stats: { errors: 1, warnings: 0, suggestions: 0 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      await reviewer.reviewPR('feature-branch', false);

      expect(mockPRCommentService.postComments).not.toHaveBeenCalled();
      expect(mockPRCommentService.postReviewSummary).not.toHaveBeenCalled();
    });

    it('should filter comments to only changed lines', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/file.ts', status: 'modified', changedLines: new Set([10, 11]) },
      ];

      const mockChunks = [createChunk({ startLine: 1, endLine: 20 })];
      const mockReviewResult: ReviewResult = {
        comments: [
          { file: 'src/file.ts', line: 10, body: 'Changed line', severity: 'error' },
          { file: 'src/file.ts', line: 5, body: 'Unchanged line', severity: 'warning' },
          { file: 'src/file.ts', line: 11, body: 'Changed line', severity: 'info' },
        ],
        summary: 'Review',
        stats: { errors: 1, warnings: 1, suggestions: 1 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewPR('feature-branch', true);

      // All 3 comments should be included since they're all within the chunk range (1-20)
      // that contains changed lines (10, 11)
      expect(result.comments).toHaveLength(3);
    });

    it('should include all comments for added files', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/new-file.ts', status: 'added', changedLines: new Set([1, 2, 3]) },
      ];

      const mockChunks = [createChunk({ file: 'src/new-file.ts' })];
      const mockReviewResult: ReviewResult = {
        comments: [
          { file: 'src/new-file.ts', line: 1, body: 'Comment', severity: 'error' },
          { file: 'src/new-file.ts', line: 50, body: 'Comment', severity: 'warning' },
        ],
        summary: 'Review',
        stats: { errors: 1, warnings: 1, suggestions: 0 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewPR('feature-branch', true);

      expect(result.comments).toHaveLength(2);
    });

    it('should use base branch override from CLI', async () => {
      mockGitService.getChangedFiles.mockResolvedValue([]);

      await reviewer.reviewPR('feature-branch', true, 'develop');

      expect(mockGitService.getChangedFiles).toHaveBeenCalledWith('feature-branch', 'develop');
    });

    it('should use PR baseBranch from config when no override', async () => {
      mockConfig = createConfig({
        pr: { number: 123, baseBranch: 'release' },
      });

      const { AIProviderFactory } = require('../src/ai-provider');
      jest.spyOn(AIProviderFactory, 'create').mockReturnValue(mockAIProvider);

      const { PRCommentServiceFactory } = require('../src/pr-comments');
      jest.spyOn(PRCommentServiceFactory, 'create').mockReturnValue(mockPRCommentService);

      reviewer = new PRReviewer(mockConfig);
      mockGitService.getChangedFiles.mockResolvedValue([]);

      await reviewer.reviewPR('feature-branch', true);

      expect(mockGitService.getChangedFiles).toHaveBeenCalledWith('feature-branch', 'release');
    });

    it('should skip posting when PR number is not configured', async () => {
      mockConfig = createConfig({ pr: { number: 0 } });

      const { AIProviderFactory } = require('../src/ai-provider');
      jest.spyOn(AIProviderFactory, 'create').mockReturnValue(mockAIProvider);

      const { PRCommentServiceFactory } = require('../src/pr-comments');
      jest.spyOn(PRCommentServiceFactory, 'create').mockReturnValue(mockPRCommentService);

      reviewer = new PRReviewer(mockConfig);

      const changedFiles: ChangedFile[] = [
        { path: 'src/file.ts', status: 'modified', changedLines: new Set([10]) },
      ];
      const mockChunks = [createChunk()];
      const mockReviewResult: ReviewResult = {
        comments: [{ file: 'src/file.ts', line: 10, body: 'Issue', severity: 'error' }],
        summary: 'Review',
        stats: { errors: 1, warnings: 0, suggestions: 0 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      await reviewer.reviewPR('feature-branch', true);

      expect(mockPRCommentService.postComments).not.toHaveBeenCalled();
    });

    it('should exclude comments for files not in changed files', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/file1.ts', status: 'modified', changedLines: new Set([10]) },
      ];

      const mockChunks = [createChunk({ file: 'src/file1.ts' })];
      const mockReviewResult: ReviewResult = {
        comments: [
          { file: 'src/file1.ts', line: 10, body: 'Valid', severity: 'error' },
          { file: 'src/other.ts', line: 5, body: 'Invalid', severity: 'warning' },
        ],
        summary: 'Review',
        stats: { errors: 1, warnings: 1, suggestions: 0 },
      };

      mockGitService.getChangedFiles.mockResolvedValue(changedFiles);
      mockChunkService.chunkChangedFiles.mockResolvedValue(mockChunks);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewPR('feature-branch', true);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].file).toBe('src/file1.ts');
    });
  });

  describe('reviewFile', () => {
    it('should review a file with range', async () => {
      const mockChunk = createChunk({ startLine: 10, endLine: 50 });
      const mockReviewResult: ReviewResult = {
        comments: [{ file: 'src/file.ts', line: 15, body: 'Issue', severity: 'error' }],
        summary: 'Review',
        stats: { errors: 1, warnings: 0, suggestions: 0 },
      };

      mockChunkService.chunkFileByRange.mockResolvedValue(mockChunk);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewFile('src/file.ts', 'feature-branch', 10, 50);

      expect(mockChunkService.chunkFileByRange).toHaveBeenCalledWith(
        'src/file.ts',
        10,
        50,
        'feature-branch'
      );
      expect(result.comments).toHaveLength(1);
    });

    it('should review entire file if no range specified', async () => {
      const mockChunks = [createChunk()];
      const mockReviewResult: ReviewResult = {
        comments: [],
        summary: 'Review',
        stats: { errors: 0, warnings: 0, suggestions: 0 },
      };

      mockChunkService.chunkFile.mockResolvedValue(mockChunks);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      await reviewer.reviewFile('src/file.ts', 'feature-branch');

      expect(mockChunkService.chunkFile).toHaveBeenCalledWith('src/file.ts', 'feature-branch');
    });

    it('should handle multiple chunks from file', async () => {
      const mockChunks = [
        createChunk({ id: 'chunk1', startLine: 1, endLine: 10 }),
        createChunk({ id: 'chunk2', startLine: 11, endLine: 20 }),
      ];
      const mockReviewResult: ReviewResult = {
        comments: [
          { file: 'src/file.ts', line: 5, body: 'Issue 1', severity: 'error' },
          { file: 'src/file.ts', line: 15, body: 'Issue 2', severity: 'warning' },
        ],
        summary: 'Review',
        stats: { errors: 1, warnings: 1, suggestions: 0 },
      };

      mockChunkService.chunkFile.mockResolvedValue(mockChunks);
      mockAIProvider.reviewCode.mockResolvedValue(mockReviewResult);

      const result = await reviewer.reviewFile('src/file.ts', 'feature-branch');

      expect(mockAIProvider.reviewCode).toHaveBeenCalledWith(mockChunks, ['rule1', 'rule2']);
      expect(result.comments).toHaveLength(2);
    });
  });
});
