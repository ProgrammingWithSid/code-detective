import { AIProviderInterface } from '../src/ai-provider';
import { CodeChunk, ReviewResult } from '../src/types';
import { ParallelReviewer } from '../src/utils/parallel-reviewer';

describe('ParallelReviewer', () => {
  let reviewer: ParallelReviewer;
  let mockAIProvider: jest.Mocked<AIProviderInterface>;

  const createMockChunks = (count: number): CodeChunk[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `chunk${i}`,
      name: `test${i}`,
      type: 'function',
      file: `file${i}.ts`,
      startLine: 1,
      endLine: 10,
      content: `function test${i}() {}`,
    }));
  };

  const createMockReviewResult = (errors = 0, warnings = 0): ReviewResult => ({
    comments: [],
    summary: 'Test review',
    stats: { errors, warnings, suggestions: 0 },
    recommendation: errors > 0 ? 'BLOCK' : 'APPROVE',
    topIssues: [],
  });

  beforeEach(() => {
    reviewer = new ParallelReviewer();
    mockAIProvider = {
      reviewCode: jest.fn(),
    } as unknown as jest.Mocked<AIProviderInterface>;
  });

  describe('reviewBatches', () => {
    it('should process single batch', async () => {
      const batches = [createMockChunks(2)];
      const mockResult = createMockReviewResult();

      mockAIProvider.reviewCode.mockResolvedValue(mockResult);

      const result = await reviewer.reviewBatches(batches, mockAIProvider, []);

      expect(mockAIProvider.reviewCode).toHaveBeenCalledTimes(1);
      expect(result.comments).toEqual([]);
      expect(result.stats.errors).toBe(0);
    });

    it('should process multiple batches in parallel', async () => {
      const batches = [createMockChunks(2), createMockChunks(2), createMockChunks(2)];
      const mockResult = createMockReviewResult();

      mockAIProvider.reviewCode.mockResolvedValue(mockResult);

      const result = await reviewer.reviewBatches(batches, mockAIProvider, []);

      expect(mockAIProvider.reviewCode).toHaveBeenCalledTimes(3);
      expect(result.comments).toEqual([]);
    });

    it('should respect concurrency limit', async () => {
      const reviewerWithLimit = new ParallelReviewer({ concurrency: 2 });
      const batches = [
        createMockChunks(1),
        createMockChunks(1),
        createMockChunks(1),
        createMockChunks(1),
      ];
      const mockResult = createMockReviewResult();

      mockAIProvider.reviewCode.mockResolvedValue(mockResult);

      await reviewerWithLimit.reviewBatches(batches, mockAIProvider, []);

      // Should process in groups of 2
      expect(mockAIProvider.reviewCode).toHaveBeenCalledTimes(4);
    });

    it('should merge results from multiple batches', async () => {
      const batches = [createMockChunks(1), createMockChunks(1)];
      const result1 = createMockReviewResult(1, 2);
      const result2 = createMockReviewResult(0, 3);

      mockAIProvider.reviewCode.mockResolvedValueOnce(result1).mockResolvedValueOnce(result2);

      const merged = await reviewer.reviewBatches(batches, mockAIProvider, []);

      expect(merged.stats.errors).toBe(1);
      expect(merged.stats.warnings).toBe(5);
    });

    it('should deduplicate comments', async () => {
      const batches = [createMockChunks(1), createMockChunks(1)];
      const comment = {
        file: 'test.ts',
        line: 10,
        body: 'Duplicate comment',
        severity: 'warning' as const,
      };

      const result1: ReviewResult = {
        comments: [comment],
        summary: 'Review 1',
        stats: { errors: 0, warnings: 1, suggestions: 0 },
        recommendation: 'APPROVE',
        topIssues: [],
      };

      const result2: ReviewResult = {
        comments: [comment], // Same comment
        summary: 'Review 2',
        stats: { errors: 0, warnings: 1, suggestions: 0 },
        recommendation: 'APPROVE',
        topIssues: [],
      };

      mockAIProvider.reviewCode.mockResolvedValueOnce(result1).mockResolvedValueOnce(result2);

      const merged = await reviewer.reviewBatches(batches, mockAIProvider, []);

      // Should deduplicate
      expect(merged.comments.length).toBe(1);
    });

    it('should handle timeout', async () => {
      const reviewerWithTimeout = new ParallelReviewer({ timeout: 100 });
      const batches = [createMockChunks(1)];

      mockAIProvider.reviewCode.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(createMockReviewResult()), 200);
          })
      );

      const result = await reviewerWithTimeout.reviewBatches(batches, mockAIProvider, []);

      // Should return empty result on timeout (check for error message or empty stats)
      expect(result.summary).toBeDefined();
      // Timeout should result in empty comments or error message
      expect(result.comments.length).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      const batches = [createMockChunks(1)];

      mockAIProvider.reviewCode.mockRejectedValue(new Error('API error'));

      const result = await reviewer.reviewBatches(batches, mockAIProvider, []);

      // Should return empty result on error (check for empty comments)
      expect(result.comments.length).toBe(0);
      expect(result.stats.errors).toBe(0);
      expect(result.stats.warnings).toBe(0);
    });
  });

  describe('result merging', () => {
    it('should determine recommendation based on stats', async () => {
      const batches = [createMockChunks(1)];

      // Test BLOCK recommendation
      const blockResult = createMockReviewResult(1, 0);
      mockAIProvider.reviewCode.mockResolvedValue(blockResult);
      const result1 = await reviewer.reviewBatches(batches, mockAIProvider, []);
      expect(result1.recommendation).toBe('BLOCK');

      // Test REQUEST_CHANGES recommendation
      const changesResult = createMockReviewResult(0, 10);
      mockAIProvider.reviewCode.mockResolvedValue(changesResult);
      const result2 = await reviewer.reviewBatches(batches, mockAIProvider, []);
      expect(result2.recommendation).toBe('REQUEST_CHANGES');

      // Test APPROVE_WITH_NITS recommendation
      const nitsResult = createMockReviewResult(0, 3);
      mockAIProvider.reviewCode.mockResolvedValue(nitsResult);
      const result3 = await reviewer.reviewBatches(batches, mockAIProvider, []);
      expect(result3.recommendation).toBe('APPROVE_WITH_NITS');

      // Test APPROVE recommendation
      const approveResult = createMockReviewResult(0, 0);
      mockAIProvider.reviewCode.mockResolvedValue(approveResult);
      const result4 = await reviewer.reviewBatches(batches, mockAIProvider, []);
      expect(result4.recommendation).toBe('APPROVE');
    });

    it('should extract top issues', async () => {
      const batches = [createMockChunks(1)];
      const result: ReviewResult = {
        comments: [
          {
            file: 'file1.ts',
            line: 10,
            body: 'Error 1',
            severity: 'error',
          },
          {
            file: 'file2.ts',
            line: 20,
            body: 'Warning 1',
            severity: 'warning',
          },
        ],
        summary: 'Review',
        stats: { errors: 1, warnings: 1, suggestions: 0 },
        recommendation: 'BLOCK',
        topIssues: [],
      };

      mockAIProvider.reviewCode.mockResolvedValue(result);

      const merged = await reviewer.reviewBatches(batches, mockAIProvider, []);

      expect(merged.topIssues).toBeDefined();
      expect(merged.topIssues!.length).toBeGreaterThan(0);
      expect(merged.topIssues!.length).toBeLessThanOrEqual(5);
    });
  });
});
