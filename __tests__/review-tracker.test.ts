import * as fs from 'fs';
import * as path from 'path';
import { ReviewTracker } from '../src/utils/review-tracker';
import { CodeChunk } from '../src/types';

describe('ReviewTracker', () => {
  let tracker: ReviewTracker;
  let testStoragePath: string;

  beforeEach(() => {
    // Use a unique test storage path for each test
    testStoragePath = path.join(__dirname, 'test-reviews-' + Date.now());
    tracker = new ReviewTracker(testStoragePath, 1000);
  });

  afterEach(() => {
    // Clean up test storage
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }
  });

  describe('filterChunksForReview', () => {
    it('should return all chunks when none have been reviewed', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
        {
          id: '2',
          name: 'testClass',
          type: 'class',
          file: 'test.ts',
          startLine: 12,
          endLine: 20,
          content: 'class Test {}',
        },
      ];

      const result = tracker.filterChunksForReview(chunks, 'feature-branch');

      expect(result.chunksToReview).toHaveLength(2);
      expect(result.stats.totalChunks).toBe(2);
      expect(result.stats.reviewedChunks).toBe(0);
      expect(result.stats.newChunks).toBe(2);
      expect(result.stats.changedChunks).toBe(0);
      expect(result.stats.skippedChunks).toBe(0);
      expect(result.stats.skipRate).toBe(0);
    });

    it('should skip chunks that have been reviewed', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
        {
          id: '2',
          name: 'testClass',
          type: 'class',
          file: 'test.ts',
          startLine: 12,
          endLine: 20,
          content: 'class Test {}',
          hash: 'def456',
        },
      ];

      // Mark first chunk as reviewed
      tracker.markAsReviewed([chunks[0]], [], 'feature-branch');

      const result = tracker.filterChunksForReview(chunks, 'feature-branch');

      expect(result.chunksToReview).toHaveLength(1);
      expect(result.chunksToReview[0].id).toBe('2');
      expect(result.stats.totalChunks).toBe(2);
      expect(result.stats.reviewedChunks).toBe(1);
      expect(result.stats.newChunks).toBe(1);
      expect(result.stats.skippedChunks).toBe(1);
      expect(result.stats.skipRate).toBe(0.5);
    });

    it('should detect changed chunks by line ranges', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      // Mark chunk as reviewed
      tracker.markAsReviewed([chunks[0]], [], 'feature-branch');

      // Modify chunk (different line range)
      const modifiedChunk: CodeChunk = {
        ...chunks[0],
        startLine: 1,
        endLine: 15, // Changed end line
      };

      const result = tracker.filterChunksForReview([modifiedChunk], 'feature-branch');

      expect(result.chunksToReview).toHaveLength(1);
      expect(result.stats.changedChunks).toBe(1);
      expect(result.stats.reviewedChunks).toBe(0);
    });

    it('should detect changed chunks by file path', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      tracker.markAsReviewed([chunks[0]], [], 'feature-branch');

      // Modify chunk (different file)
      const modifiedChunk: CodeChunk = {
        ...chunks[0],
        file: 'test2.ts', // Changed file
      };

      const result = tracker.filterChunksForReview([modifiedChunk], 'feature-branch');

      expect(result.chunksToReview).toHaveLength(1);
      expect(result.stats.changedChunks).toBe(1);
    });

    it('should reset state when branch changes', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      tracker.markAsReviewed([chunks[0]], [], 'feature-branch');

      // Different branch should reset state
      const result = tracker.filterChunksForReview(chunks, 'other-branch');

      expect(result.chunksToReview).toHaveLength(1);
      expect(result.stats.newChunks).toBe(1);
    });

    it('should reset state when base branch changes', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      tracker.markAsReviewed([chunks[0]], [], 'feature-branch', 'main');

      // Different base branch should reset state
      const result = tracker.filterChunksForReview(chunks, 'feature-branch', 'develop');

      expect(result.chunksToReview).toHaveLength(1);
      expect(result.stats.newChunks).toBe(1);
    });

    it('should generate hash from content when chunk hash is not available', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          // No hash provided
        },
      ];

      tracker.markAsReviewed([chunks[0]], [], 'feature-branch');

      const result = tracker.filterChunksForReview(chunks, 'feature-branch');

      expect(result.chunksToReview).toHaveLength(0);
      expect(result.stats.skippedChunks).toBe(1);
    });
  });

  describe('markAsReviewed', () => {
    it('should mark chunks as reviewed', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      tracker.markAsReviewed(chunks, [], 'feature-branch');

      const stats = tracker.getStats('feature-branch');
      expect(stats.totalReviewed).toBe(1);
      expect(stats.lastReviewedAt).toBeGreaterThan(0);
    });

    it('should store review hash when comments are provided', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      const comments = [
        { file: 'test.ts', line: 5, body: 'Add null check' },
        { file: 'test.ts', line: 8, body: 'Use const instead of let' },
      ];

      tracker.markAsReviewed(chunks, comments, 'feature-branch');

      const stats = tracker.getStats('feature-branch');
      expect(stats.totalReviewed).toBe(1);
    });

    it('should update existing reviewed chunks', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      tracker.markAsReviewed(chunks, [], 'feature-branch');
      const stats1 = tracker.getStats('feature-branch');

      // Mark again
      tracker.markAsReviewed(chunks, [], 'feature-branch');
      const stats2 = tracker.getStats('feature-branch');

      expect(stats2.totalReviewed).toBe(1); // Still 1, not 2
      expect(stats2.lastReviewedAt).toBeGreaterThanOrEqual(stats1.lastReviewedAt);
    });

    it('should handle multiple chunks', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
        {
          id: '2',
          name: 'testClass',
          type: 'class',
          file: 'test.ts',
          startLine: 12,
          endLine: 20,
          content: 'class Test {}',
          hash: 'def456',
        },
      ];

      tracker.markAsReviewed(chunks, [], 'feature-branch');

      const stats = tracker.getStats('feature-branch');
      expect(stats.totalReviewed).toBe(2);
    });
  });

  describe('clearState', () => {
    it('should clear state for a specific branch', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      tracker.markAsReviewed(chunks, [], 'feature-branch');
      expect(tracker.getStats('feature-branch').totalReviewed).toBe(1);

      tracker.clearState('feature-branch');
      expect(tracker.getStats('feature-branch').totalReviewed).toBe(0);
    });

    it('should not clear state for different branch', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      tracker.markAsReviewed(chunks, [], 'feature-branch');
      tracker.clearState('other-branch');

      expect(tracker.getStats('feature-branch').totalReviewed).toBe(1);
    });
  });

  describe('clearAll', () => {
    it('should clear all review history', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      tracker.markAsReviewed(chunks, [], 'feature-branch');
      tracker.markAsReviewed(chunks, [], 'other-branch');

      tracker.clearAll();

      expect(tracker.getStats('feature-branch').totalReviewed).toBe(0);
      expect(tracker.getStats('other-branch').totalReviewed).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      const beforeStats = tracker.getStats('feature-branch');
      expect(beforeStats.totalReviewed).toBe(0);
      expect(beforeStats.lastReviewedAt).toBe(0);

      tracker.markAsReviewed(chunks, [], 'feature-branch');

      const afterStats = tracker.getStats('feature-branch');
      expect(afterStats.totalReviewed).toBe(1);
      expect(afterStats.lastReviewedAt).toBeGreaterThan(0);
    });

    it('should return zero stats for new branch', () => {
      const stats = tracker.getStats('new-branch');
      expect(stats.totalReviewed).toBe(0);
      expect(stats.lastReviewedAt).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty chunks array', () => {
      const result = tracker.filterChunksForReview([], 'feature-branch');
      expect(result.chunksToReview).toHaveLength(0);
      expect(result.stats.totalChunks).toBe(0);
    });

    it('should handle marking empty chunks array', () => {
      expect(() => {
        tracker.markAsReviewed([], [], 'feature-branch');
      }).not.toThrow();
    });

    it('should handle missing storage directory gracefully', () => {
      // Use a path that might fail on some systems, but won't crash
      // We'll test with a relative path that should work
      const relativeTracker = new ReviewTracker('./test-reviews-temp');

      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      // Should not throw - tracker should handle gracefully
      expect(() => {
        relativeTracker.markAsReviewed(chunks, [], 'feature-branch');
        relativeTracker.filterChunksForReview(chunks, 'feature-branch');
      }).not.toThrow();

      // Clean up
      if (fs.existsSync('./test-reviews-temp')) {
        fs.rmSync('./test-reviews-temp', { recursive: true, force: true });
      }
    });

    it('should handle corrupted state file gracefully', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'testFunction',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'abc123',
        },
      ];

      // Create corrupted state file
      const stateFile = path.join(testStoragePath, 'review-state.json');
      fs.mkdirSync(testStoragePath, { recursive: true });
      fs.writeFileSync(stateFile, 'invalid json{', 'utf-8');

      // Should handle gracefully and start fresh
      const result = tracker.filterChunksForReview(chunks, 'feature-branch');
      expect(result.chunksToReview).toHaveLength(1);
      expect(result.stats.newChunks).toBe(1);
    });
  });

  describe('maxHistorySize', () => {
    it('should limit history size', () => {
      const smallTracker = new ReviewTracker(testStoragePath, 2); // Max 2 chunks

      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'test1',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test1() {}',
          hash: 'hash1',
        },
        {
          id: '2',
          name: 'test2',
          type: 'function',
          file: 'test.ts',
          startLine: 11,
          endLine: 20,
          content: 'function test2() {}',
          hash: 'hash2',
        },
        {
          id: '3',
          name: 'test3',
          type: 'function',
          file: 'test.ts',
          startLine: 21,
          endLine: 30,
          content: 'function test3() {}',
          hash: 'hash3',
        },
      ];

      smallTracker.markAsReviewed([chunks[0]], [], 'feature-branch');
      smallTracker.markAsReviewed([chunks[1]], [], 'feature-branch');
      smallTracker.markAsReviewed([chunks[2]], [], 'feature-branch');

      // Should keep only the most recent 2
      const stats = smallTracker.getStats('feature-branch');
      expect(stats.totalReviewed).toBeLessThanOrEqual(2);
    });
  });
});
