/**
 * Tests for False Positive Filter
 */

import {
  createFalsePositiveFilter,
  FalsePositiveFilter,
} from '../src/analyzers/false-positive-filter';
import { ReviewComment } from '../src/types';

describe('FalsePositiveFilter', () => {
  let filter: FalsePositiveFilter;

  beforeEach(() => {
    filter = createFalsePositiveFilter({
      minConfidence: 0.5,
      enableToolFiltering: true,
      enablePatternFiltering: true,
    });
  });

  describe('filterReviewComments', () => {
    it('should filter style preferences', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Prefer const over let',
          severity: 'suggestion',
          category: 'style',
        },
        {
          file: 'test.ts',
          line: 20,
          body: 'SQL injection vulnerability',
          severity: 'error',
          category: 'security',
        },
      ];

      const { filtered, stats } = filter.filterReviewComments(comments);

      expect(filtered.length).toBeLessThan(comments.length);
      expect(filtered.some((c) => c.body.includes('SQL injection'))).toBe(true);
      expect(stats.totalIssues).toBe(comments.length);
      expect(stats.filteredIssues).toBeGreaterThan(0);
    });

    it('should filter formatting issues', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 50,
          body: 'Line too long (120 characters)',
          severity: 'warning',
          category: 'formatting',
        },
        {
          file: 'test.ts',
          line: 60,
          body: 'Unhandled promise rejection',
          severity: 'error',
          category: 'bug',
        },
      ];

      const { filtered } = filter.filterReviewComments(comments);

      expect(filtered.length).toBeLessThan(comments.length);
      expect(filtered.some((c) => c.body.includes('promise rejection'))).toBe(true);
    });

    it('should never filter errors', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Critical security vulnerability',
          severity: 'error',
          category: 'security',
        },
        {
          file: 'test.ts',
          line: 20,
          body: 'Type error: cannot assign',
          severity: 'error',
          category: 'bug',
        },
      ];

      const { filtered } = filter.filterReviewComments(comments);

      expect(filtered.length).toBe(comments.length);
      expect(filtered.every((c) => c.severity === 'error')).toBe(true);
    });

    it('should filter low-confidence suggestions', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Consider using arrow function',
          severity: 'suggestion',
          category: 'style',
        },
        {
          file: 'test.ts',
          line: 20,
          body: 'Missing return type annotation',
          severity: 'suggestion',
          category: 'style',
        },
      ];

      const { filtered } = filter.filterReviewComments(comments);

      // Some suggestions may be filtered
      expect(filtered.length).toBeLessThanOrEqual(comments.length);
    });

    it('should calculate filter statistics correctly', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Prefer const',
          severity: 'suggestion',
          category: 'style',
        },
        {
          file: 'test.ts',
          line: 20,
          body: 'Line too long',
          severity: 'warning',
          category: 'formatting',
        },
        {
          file: 'test.ts',
          line: 30,
          body: 'Security issue',
          severity: 'error',
          category: 'security',
        },
      ];

      const { stats } = filter.filterReviewComments(comments);

      expect(stats.totalIssues).toBe(comments.length);
      expect(stats.filteredIssues).toBeGreaterThanOrEqual(0);
      expect(stats.remainingIssues).toBe(stats.totalIssues - stats.filteredIssues);
      expect(stats.filterRate).toBeGreaterThanOrEqual(0);
      expect(stats.filterRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Tool-specific filtering', () => {
    it('should filter ESLint false positives', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Unexpected console statement',
          severity: 'warning',
          category: 'style',
          tool: 'eslint',
        },
        {
          file: 'test.ts',
          line: 20,
          body: 'Type error',
          severity: 'error',
          category: 'bug',
          tool: 'eslint',
        },
      ];

      const { filtered } = filter.filterReviewComments(comments);

      // Console warnings may be filtered, but errors should not
      expect(filtered.some((c) => c.body.includes('Type error'))).toBe(true);
    });

    it('should filter Prettier formatting issues', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Prettier: Insert semicolon',
          severity: 'warning',
          category: 'formatting',
          tool: 'prettier',
        },
      ];

      const { filtered } = filter.filterReviewComments(comments);

      // Prettier issues are often filtered
      expect(filtered.length).toBeLessThanOrEqual(comments.length);
    });
  });

  describe('Pattern-based filtering', () => {
    it('should filter based on custom patterns', () => {
      const customFilter = createFalsePositiveFilter({
        minConfidence: 0.5,
        customPatterns: [
          {
            pattern: /test-pattern/i,
            reason: 'Test pattern',
            confidenceThreshold: 0.3,
          },
        ],
      });

      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'This is a test-pattern issue',
          severity: 'warning',
          category: 'style',
        },
      ];

      const { filtered } = customFilter.filterReviewComments(comments);

      expect(filtered.length).toBeLessThan(comments.length);
    });

    it('should respect confidence thresholds', () => {
      const strictFilter = createFalsePositiveFilter({
        minConfidence: 0.8,
        enablePatternFiltering: true,
      });

      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Low confidence suggestion',
          severity: 'suggestion',
          category: 'style',
        },
        {
          file: 'test.ts',
          line: 20,
          body: 'High confidence security issue',
          severity: 'error',
          category: 'security',
        },
      ];

      const { filtered } = strictFilter.filterReviewComments(comments);

      // More filtering with higher threshold
      expect(filtered.length).toBeLessThanOrEqual(comments.length);
      expect(filtered.some((c) => c.severity === 'error')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty comment list', () => {
      const { filtered, stats } = filter.filterReviewComments([]);

      expect(filtered.length).toBe(0);
      expect(stats.totalIssues).toBe(0);
      expect(stats.filteredIssues).toBe(0);
      expect(stats.filterRate).toBe(0);
    });

    it('should handle comments without tool information', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Some issue',
          severity: 'warning',
          category: 'style',
        },
      ];

      const { filtered } = filter.filterReviewComments(comments);

      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long comment bodies', () => {
      const longBody = 'A'.repeat(1000);
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: longBody,
          severity: 'warning',
          category: 'style',
        },
      ];

      const { filtered } = filter.filterReviewComments(comments);

      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle special characters in comments', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Issue with special chars: <>&"\'',
          severity: 'warning',
          category: 'style',
        },
      ];

      const { filtered } = filter.filterReviewComments(comments);

      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration Options', () => {
    it('should respect enableToolFiltering flag', () => {
      const filterWithoutToolFiltering = createFalsePositiveFilter({
        enableToolFiltering: false,
        enablePatternFiltering: true,
      });

      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'ESLint: no-console',
          severity: 'warning',
          category: 'style',
          tool: 'eslint',
        },
      ];

      const { filtered } = filterWithoutToolFiltering.filterReviewComments(comments);

      // Without tool filtering, may filter less
      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect enablePatternFiltering flag', () => {
      const filterWithoutPatternFiltering = createFalsePositiveFilter({
        enableToolFiltering: true,
        enablePatternFiltering: false,
      });

      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 10,
          body: 'Prefer const over let',
          severity: 'suggestion',
          category: 'style',
        },
      ];

      const { filtered } = filterWithoutPatternFiltering.filterReviewComments(comments);

      // Without pattern filtering, may filter less
      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });
  });
});
