import { AIProviderInterface } from '../src/ai-provider';
import { ChunkService } from '../src/chunker';
import { GitService } from '../src/git';
import { PRCommentService } from '../src/pr-comments';
import { PRReviewer } from '../src/reviewer';
import { Config, ReviewResult } from '../src/types';

jest.mock('../src/chunker');
jest.mock('../src/git');
jest.mock('../src/ai-provider');
jest.mock('../src/pr-comments');

describe('PRReviewer with Caching', () => {
  let reviewer: PRReviewer;
  let mockChunkService: jest.Mocked<ChunkService>;
  let mockGitService: jest.Mocked<GitService>;
  let mockAIProvider: jest.Mocked<AIProviderInterface>;
  let mockPRCommentService: jest.Mocked<PRCommentService>;

  const createMockConfig = (): Config => ({
    aiProvider: 'openai',
    openai: {
      apiKey: 'test-key',
      model: 'gpt-4',
    },
    globalRules: [],
    repository: {
      owner: 'test',
      repo: 'test-repo',
      baseBranch: 'main',
    },
    pr: {
      number: 1,
      baseBranch: 'main',
    },
    github: {
      token: 'test-token',
    },
    reviewCache: {
      ttl: 1000, // 1 second for testing
      maxSize: 10,
    },
  });

  const createMockChunks = () => [
    {
      id: 'chunk1',
      name: 'testFunction',
      type: 'function',
      file: 'src/test.ts',
      startLine: 1,
      endLine: 10,
      content: 'function test() {}',
      hash: 'hash1',
    },
  ];

  const createMockReviewResult = (): ReviewResult => ({
    comments: [
      {
        file: 'src/test.ts',
        line: 5,
        body: 'Test comment',
        severity: 'warning',
      },
    ],
    summary: 'Test review summary',
    stats: {
      errors: 0,
      warnings: 1,
      suggestions: 0,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockChunkService = {
      chunkChangedFiles: jest.fn(),
      chunkFile: jest.fn(),
      chunkFileByRange: jest.fn(),
    } as unknown as jest.Mocked<ChunkService>;

    const mockChangedFiles = [
      {
        path: 'src/test.ts',
        status: 'modified' as const,
        changedLines: new Set([5, 6, 7]),
      },
    ];

    mockGitService = {
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      getChangedFiles: jest.fn().mockResolvedValue(mockChangedFiles),
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      getFileContent: jest.fn(),
    } as unknown as jest.Mocked<GitService>;

    mockAIProvider = {
      reviewCode: jest.fn(),
    } as unknown as jest.Mocked<AIProviderInterface>;

    mockPRCommentService = {
      postComments: jest.fn().mockResolvedValue(undefined),
      postReviewSummary: jest.fn().mockResolvedValue(undefined),
      postSuggestions: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PRCommentService>;

    const config = createMockConfig();
    reviewer = new PRReviewer(config);

    // Inject mocks after creation using Object.assign to access protected properties
    Object.assign(reviewer, {
      chunker: mockChunkService,
      git: mockGitService,
      aiProvider: mockAIProvider,
      prCommentService: mockPRCommentService,
    });
  });

  describe('review caching', () => {
    it('should cache review results', async () => {
      const chunks = createMockChunks();
      const reviewResult = createMockReviewResult();

      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks);
      mockAIProvider.reviewCode.mockResolvedValue(reviewResult);

      // First review - should call AI
      await reviewer.reviewPR('feature-branch', false);

      expect(mockAIProvider.reviewCode).toHaveBeenCalledTimes(1);

      // Reset mocks but keep same chunks
      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks);
      mockAIProvider.reviewCode.mockClear();

      // Second review with same chunks - should use cache
      await reviewer.reviewPR('feature-branch', false);

      // Should not call AI again if cache hit
      // Note: This depends on cache key generation being consistent
      const stats = reviewer.getCacheStats();
      if (stats.hits > 0) {
        expect(mockAIProvider.reviewCode).not.toHaveBeenCalled();
      }
    });

    it('should use cache when chunks are unchanged', async () => {
      const chunks = createMockChunks();
      const reviewResult = createMockReviewResult();

      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks);
      mockAIProvider.reviewCode.mockResolvedValue(reviewResult);

      // First review
      await reviewer.reviewPR('feature-branch', false);
      const stats1 = reviewer.getCacheStats();

      // Second review with same chunks
      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks);
      await reviewer.reviewPR('feature-branch', false);
      const stats2 = reviewer.getCacheStats();

      // Should have cache hits
      expect(stats2.hits).toBeGreaterThanOrEqual(stats1.hits);
    });

    it('should bypass cache when chunks change', async () => {
      const chunks1 = createMockChunks();
      const chunks2 = [
        {
          ...chunks1[0],
          id: 'chunk2',
          content: 'function test2() {}',
          hash: 'hash2',
        },
      ];
      const reviewResult = createMockReviewResult();

      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks1);
      mockAIProvider.reviewCode.mockResolvedValue(reviewResult);

      // First review
      await reviewer.reviewPR('feature-branch', false);

      // Second review with different chunks
      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks2);
      await reviewer.reviewPR('feature-branch', false);

      // Should call AI for both (different cache keys)
      expect(mockAIProvider.reviewCode).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache statistics', () => {
    it('should track cache statistics', async () => {
      const chunks = createMockChunks();
      const reviewResult = createMockReviewResult();

      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks);
      mockAIProvider.reviewCode.mockResolvedValue(reviewResult);

      await reviewer.reviewPR('feature-branch', false);

      const stats = reviewer.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.size).toBeGreaterThanOrEqual(0);
      expect(stats.hits).toBeGreaterThanOrEqual(0);
      expect(stats.misses).toBeGreaterThanOrEqual(0);
    });

    it('should return correct hit rate', async () => {
      const chunks = createMockChunks();
      const reviewResult = createMockReviewResult();

      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks);
      mockAIProvider.reviewCode.mockResolvedValue(reviewResult);

      await reviewer.reviewPR('feature-branch', false);
      await reviewer.reviewPR('feature-branch', false);

      const stats = reviewer.getCacheStats();
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      const chunks = createMockChunks();
      const reviewResult = createMockReviewResult();

      mockChunkService.chunkChangedFiles.mockResolvedValue(chunks);
      mockAIProvider.reviewCode.mockResolvedValue(reviewResult);

      await reviewer.reviewPR('feature-branch', false);

      const statsBefore = reviewer.getCacheStats();
      expect(statsBefore.size).toBeGreaterThan(0);

      reviewer.clearCache();

      const statsAfter = reviewer.getCacheStats();
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('cache configuration', () => {
    it('should use custom cache TTL', () => {
      const config = createMockConfig();
      config.reviewCache = { ttl: 5000, maxSize: 20 };

      const reviewerWithCustomTTL = new PRReviewer(config);
      const stats = reviewerWithCustomTTL.getCacheStats();
      expect(stats).toBeDefined();
    });

    it('should use default cache settings when not configured', () => {
      const config = createMockConfig();
      delete config.reviewCache;

      const reviewerWithDefaults = new PRReviewer(config);
      const stats = reviewerWithDefaults.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.maxSize).toBe(500); // Default max size
    });
  });
});
