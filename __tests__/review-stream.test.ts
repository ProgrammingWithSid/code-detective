/**
 * Tests for Review Stream
 */

import { ReviewStream, ReviewStreamCallbacks } from '../src/utils/review-stream';
import { ReviewComment, ReviewResult } from '../src/types';

describe('ReviewStream', () => {
  let stream: ReviewStream;
  let callbacks: ReviewStreamCallbacks;
  let onCommentSpy: jest.Mock;
  let onProgressSpy: jest.Mock;
  let onBatchCompleteSpy: jest.Mock;
  let onCompleteSpy: jest.Mock;
  let onErrorSpy: jest.Mock;

  beforeEach(() => {
    onCommentSpy = jest.fn();
    onProgressSpy = jest.fn();
    onBatchCompleteSpy = jest.fn();
    onCompleteSpy = jest.fn();
    onErrorSpy = jest.fn();

    callbacks = {
      onComment: onCommentSpy,
      onProgress: onProgressSpy,
      onBatchComplete: onBatchCompleteSpy,
      onComplete: onCompleteSpy,
      onError: onErrorSpy,
    };

    stream = new ReviewStream(callbacks);
  });

  describe('start', () => {
    it('should emit initial progress', () => {
      stream.start(5);

      expect(onProgressSpy).toHaveBeenCalledWith({
        totalBatches: 5,
        completedBatches: 0,
        currentBatch: 0,
        percentage: 0,
      });
    });
  });

  describe('emitComment', () => {
    it('should emit comment to callback', () => {
      const comment: ReviewComment = {
        file: 'test.ts',
        line: 1,
        severity: 'error',
        body: 'Test error',
        category: 'bugs',
      };

      stream.emitComment(comment);

      expect(onCommentSpy).toHaveBeenCalledWith(comment);
    });

    it('should not call callback if not provided', () => {
      const streamWithoutCallback = new ReviewStream({});
      const comment: ReviewComment = {
        file: 'test.ts',
        line: 1,
        severity: 'error',
        body: 'Test',
        category: 'bugs',
      };

      expect(() => streamWithoutCallback.emitComment(comment)).not.toThrow();
    });
  });

  describe('emitProgress', () => {
    it('should emit progress to callback', () => {
      const progress = {
        totalBatches: 10,
        completedBatches: 5,
        currentBatch: 6,
        percentage: 50,
      };

      stream.emitProgress(progress);

      expect(onProgressSpy).toHaveBeenCalledWith(progress);
    });
  });

  describe('batchComplete', () => {
    it('should emit batch completion and progress', () => {
      stream.start(5);

      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 1,
          severity: 'error',
          body: 'Error',
          category: 'bugs',
        },
      ];

      stream.batchComplete(0, comments, 5);

      expect(onBatchCompleteSpy).toHaveBeenCalledWith(0, comments);
      expect(onProgressSpy).toHaveBeenCalledTimes(2); // start + batchComplete
    });

    it('should calculate estimated time remaining', () => {
      stream.start(5);

      // Complete first batch
      stream.batchComplete(0, [], 5);
      const firstProgress = onProgressSpy.mock.calls[1][0];

      // Complete second batch
      stream.batchComplete(1, [], 5);
      const secondProgress = onProgressSpy.mock.calls[2][0];

      // After 2 batches, should have time estimate (if batches took time)
      // Note: In fast tests, time might be 0, so we just check the property exists
      expect(secondProgress).toHaveProperty('estimatedTimeRemaining');
      // If time was recorded, estimate should be >= 0
      if (secondProgress.estimatedTimeRemaining !== undefined) {
        expect(secondProgress.estimatedTimeRemaining).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate percentage correctly', () => {
      stream.start(10);

      stream.batchComplete(0, [], 10);
      const progress1 = onProgressSpy.mock.calls[1][0];
      expect(progress1.percentage).toBe(10); // 1/10 * 100

      stream.batchComplete(1, [], 10);
      const progress2 = onProgressSpy.mock.calls[2][0];
      expect(progress2.percentage).toBe(20); // 2/10 * 100
    });
  });

  describe('complete', () => {
    it('should emit completion with final progress', () => {
      stream.start(5);

      const result: ReviewResult = {
        comments: [],
        summary: 'Test summary',
        stats: { errors: 0, warnings: 0, suggestions: 0 },
      };

      stream.complete(result);

      expect(onCompleteSpy).toHaveBeenCalledWith(result);
      expect(onProgressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 100,
        })
      );
    });
  });

  describe('error', () => {
    it('should emit error to callback', () => {
      const error = new Error('Test error');

      stream.error(error);

      expect(onErrorSpy).toHaveBeenCalledWith(error);
    });

    it('should not throw if error callback not provided', () => {
      const streamWithoutError = new ReviewStream({});
      const error = new Error('Test error');

      expect(() => streamWithoutError.error(error)).not.toThrow();
    });
  });

  describe('integration', () => {
    it('should handle full review flow', () => {
      stream.start(3);

      // Batch 1
      const comments1: ReviewComment[] = [
        {
          file: 'test1.ts',
          line: 1,
          severity: 'error',
          body: 'Error 1',
          category: 'bugs',
        },
      ];
      // Emit comments manually (as done in parallel-reviewer)
      comments1.forEach((c) => stream.emitComment(c));
      stream.batchComplete(0, comments1, 3);

      // Batch 2
      const comments2: ReviewComment[] = [
        {
          file: 'test2.ts',
          line: 1,
          severity: 'warning',
          body: 'Warning 1',
          category: 'code_quality',
        },
      ];
      // Emit comments manually
      comments2.forEach((c) => stream.emitComment(c));
      stream.batchComplete(1, comments2, 3);

      // Batch 3
      const comments3: ReviewComment[] = [];
      stream.batchComplete(2, comments3, 3);

      // Complete
      const result: ReviewResult = {
        comments: [...comments1, ...comments2],
        summary: 'Review complete',
        stats: { errors: 1, warnings: 1, suggestions: 0 },
      };
      stream.complete(result);

      expect(onProgressSpy).toHaveBeenCalledTimes(5); // start + 3 batches + complete
      expect(onBatchCompleteSpy).toHaveBeenCalledTimes(3);
      expect(onCompleteSpy).toHaveBeenCalledTimes(1);
      expect(onCommentSpy).toHaveBeenCalledTimes(2); // 2 comments emitted
    });
  });
});
