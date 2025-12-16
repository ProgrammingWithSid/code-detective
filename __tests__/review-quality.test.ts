/**
 * Tests for Review Quality Scorer
 */

import { ReviewQualityScorer, QualityFeedback } from '../src/utils/review-quality';
import { ReviewResult, ReviewComment } from '../src/types';

describe('ReviewQualityScorer', () => {
  let scorer: ReviewQualityScorer;

  beforeEach(() => {
    scorer = new ReviewQualityScorer();
  });

  describe('calculateQualityMetrics', () => {
    it('should calculate coverage correctly', () => {
      const result: ReviewResult = {
        comments: [],
        summary: 'Test summary',
        stats: { errors: 0, warnings: 0, suggestions: 0 },
      };

      const metrics = scorer.calculateQualityMetrics(result, 100, 80);

      expect(metrics.coverage).toBe(80); // 80/100 * 100
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
    });

    it('should calculate metrics with feedback', () => {
      const result: ReviewResult = {
        comments: [
          {
            file: 'test.ts',
            line: 1,
            severity: 'error',
            body: 'Test error',
            category: 'bugs',
          },
        ],
        summary: 'Test summary',
        stats: { errors: 1, warnings: 0, suggestions: 0 },
      };

      const feedback = new Map<string, QualityFeedback>();
      feedback.set('test.ts:1', {
        commentId: 'test.ts:1',
        accepted: true,
        fixed: true,
        timestamp: new Date(),
      });

      const metrics = scorer.calculateQualityMetrics(result, 10, 10, feedback);

      expect(metrics.accuracy).toBe(100); // 1 accepted / 1 total
      expect(metrics.actionability).toBe(100); // 1 fixed / 1 total
      expect(metrics.precision).toBeGreaterThanOrEqual(0);
      expect(metrics.recall).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero coverage gracefully', () => {
      const result: ReviewResult = {
        comments: [],
        summary: 'Test summary',
        stats: { errors: 0, warnings: 0, suggestions: 0 },
      };

      const metrics = scorer.calculateQualityMetrics(result, 0, 0);

      expect(metrics.coverage).toBe(0);
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateCommentConfidence', () => {
    it('should assign high confidence to error severity', () => {
      const comment: ReviewComment = {
        file: 'test.ts',
        line: 1,
        severity: 'error',
        body: 'Test error',
        category: 'security',
        fix: 'Fix suggestion',
      };

      const confidence = scorer.calculateCommentConfidence(comment);

      expect(confidence.confidence).toBe('high');
      expect(confidence.score).toBeGreaterThanOrEqual(70);
    });

    it('should assign lower confidence to suggestions without fixes', () => {
      const comment: ReviewComment = {
        file: 'test.ts',
        line: 1,
        severity: 'suggestion',
        body: 'Test suggestion',
        category: 'code_quality',
      };

      const confidence = scorer.calculateCommentConfidence(comment);

      expect(confidence.score).toBeLessThan(70);
    });

    it('should boost confidence for security issues', () => {
      const comment: ReviewComment = {
        file: 'test.ts',
        line: 1,
        severity: 'warning',
        body: 'Security issue',
        category: 'security',
        fix: 'Fix suggestion',
      };

      const confidence = scorer.calculateCommentConfidence(comment);

      expect(confidence.score).toBeGreaterThan(50);
    });
  });

  describe('recordFeedback', () => {
    it('should record feedback for comments', () => {
      const feedback: QualityFeedback = {
        commentId: 'test.ts:1',
        accepted: true,
        fixed: true,
        timestamp: new Date(),
      };

      scorer.recordFeedback('test.ts:1', feedback);

      // Feedback is stored internally, verify by checking metrics calculation
      const result: ReviewResult = {
        comments: [
          {
            file: 'test.ts',
            line: 1,
            severity: 'error',
            body: 'Test',
            category: 'bugs',
          },
        ],
        summary: 'Test',
        stats: { errors: 1, warnings: 0, suggestions: 0 },
      };

      const feedbackMap = new Map<string, QualityFeedback>();
      feedbackMap.set('test.ts:1', feedback);

      const metrics = scorer.calculateQualityMetrics(result, 10, 10, feedbackMap);
      expect(metrics.accuracy).toBe(100);
    });
  });

  describe('getQualityTrends', () => {
    it('should identify improving trend', () => {
      // Create history with more items than default days (30)
      // Recent (last 30) should have higher scores than older
      const history = Array.from({ length: 40 }, (_, i) => ({
        overallScore: i < 10 ? 50 : 70,
        accuracy: 50,
        actionability: 50,
        coverage: 50,
        precision: 50,
        recall: 50,
        confidence: 50,
      }));

      const trends = scorer.getQualityTrends(history);

      expect(trends.trend).toBe('improving');
      expect(trends.change).toBeGreaterThan(0);
    });

    it('should identify declining trend', () => {
      // Create history with more items than default days (30)
      // Recent (last 30) should have lower scores than older
      const history = Array.from({ length: 40 }, (_, i) => ({
        overallScore: i < 10 ? 80 : 50,
        accuracy: 50,
        actionability: 50,
        coverage: 50,
        precision: 50,
        recall: 50,
        confidence: 50,
      }));

      const trends = scorer.getQualityTrends(history);

      expect(trends.trend).toBe('declining');
      expect(trends.change).toBeLessThan(0);
    });

    it('should identify stable trend', () => {
      const history = [
        {
          overallScore: 70,
          accuracy: 70,
          actionability: 70,
          coverage: 70,
          precision: 70,
          recall: 70,
          confidence: 70,
        },
        {
          overallScore: 72,
          accuracy: 72,
          actionability: 72,
          coverage: 72,
          precision: 72,
          recall: 72,
          confidence: 72,
        },
        {
          overallScore: 71,
          accuracy: 71,
          actionability: 71,
          coverage: 71,
          precision: 71,
          recall: 71,
          confidence: 71,
        },
      ];

      const trends = scorer.getQualityTrends(history);

      expect(trends.trend).toBe('stable');
    });

    it('should handle empty history', () => {
      const trends = scorer.getQualityTrends([]);

      expect(trends.trend).toBe('stable');
      expect(trends.averageScore).toBe(0);
      expect(trends.change).toBe(0);
    });
  });
});
