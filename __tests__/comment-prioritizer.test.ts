/**
 * Tests for Comment Prioritizer
 */

import { CommentPrioritizer } from '../src/utils/comment-prioritizer';
import { ReviewComment } from '../src/types';

describe('CommentPrioritizer', () => {
  let prioritizer: CommentPrioritizer;

  beforeEach(() => {
    prioritizer = new CommentPrioritizer();
  });

  describe('prioritizeComments', () => {
    it('should prioritize errors over warnings', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 1,
          severity: 'warning',
          body: 'Warning',
          category: 'code_quality',
        },
        {
          file: 'test.ts',
          line: 2,
          severity: 'error',
          body: 'Error',
          category: 'bugs',
        },
      ];

      const prioritized = prioritizer.prioritizeComments(comments);

      expect(prioritized[0].severity).toBe('error');
      expect(prioritized[0].priority).toBeGreaterThan(prioritized[1].priority);
    });

    it('should prioritize security issues', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 1,
          severity: 'warning',
          body: 'Code quality issue',
          category: 'code_quality',
        },
        {
          file: 'test.ts',
          line: 2,
          severity: 'warning',
          body: 'Security issue',
          category: 'security',
        },
      ];

      const prioritized = prioritizer.prioritizeComments(comments);

      expect(prioritized[0].category).toBe('security');
      expect(prioritized[0].priority).toBeGreaterThan(prioritized[1].priority);
    });

    it('should boost priority for comments with fixes', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 1,
          severity: 'warning',
          body: 'No fix',
          category: 'code_quality',
        },
        {
          file: 'test.ts',
          line: 2,
          severity: 'warning',
          body: 'Has fix',
          category: 'code_quality',
          fix: 'Fix suggestion',
        },
      ];

      const prioritized = prioritizer.prioritizeComments(comments);

      expect(prioritized[0].fix).toBeDefined();
      expect(prioritized[0].priority).toBeGreaterThan(prioritized[1].priority);
    });

    it('should return comments sorted by priority (highest first)', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 1,
          severity: 'suggestion',
          body: 'Suggestion',
          category: 'code_quality',
        },
        {
          file: 'test.ts',
          line: 2,
          severity: 'error',
          body: 'Error',
          category: 'security',
          fix: 'Fix',
        },
        {
          file: 'test.ts',
          line: 3,
          severity: 'warning',
          body: 'Warning',
          category: 'bugs',
        },
      ];

      const prioritized = prioritizer.prioritizeComments(comments);

      // Should be sorted: error (security) > warning (bugs) > suggestion
      expect(prioritized[0].severity).toBe('error');
      expect(prioritized[1].severity).toBe('warning');
      expect(prioritized[2].severity).toBe('suggestion');

      // Verify priorities are descending
      expect(prioritized[0].priority).toBeGreaterThan(prioritized[1].priority);
      expect(prioritized[1].priority).toBeGreaterThan(prioritized[2].priority);
    });
  });

  describe('groupByPriority', () => {
    it('should group comments by priority levels', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 1,
          severity: 'error',
          body: 'Critical error',
          category: 'security',
          fix: 'Fix',
        },
        {
          file: 'test.ts',
          line: 2,
          severity: 'warning',
          body: 'High priority warning',
          category: 'bugs',
        },
        {
          file: 'test.ts',
          line: 3,
          severity: 'info',
          body: 'Low priority info',
          category: 'code_quality',
        },
      ];

      const prioritized = prioritizer.prioritizeComments(comments);
      const groups = prioritizer.groupByPriority(prioritized);

      expect(groups.critical.length).toBeGreaterThan(0);
      expect(groups.high.length).toBeGreaterThanOrEqual(0);
      expect(groups.medium.length).toBeGreaterThanOrEqual(0);
      expect(groups.low.length).toBeGreaterThanOrEqual(0);

      // Critical should have highest priority items
      if (groups.critical.length > 0) {
        expect(groups.critical[0].priority).toBeGreaterThanOrEqual(70);
      }
    });

    it('should correctly categorize priority levels', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 1,
          severity: 'error',
          body: 'Error',
          category: 'security',
        },
        {
          file: 'test.ts',
          line: 2,
          severity: 'warning',
          body: 'Warning',
          category: 'bugs',
        },
        {
          file: 'test.ts',
          line: 3,
          severity: 'suggestion',
          body: 'Suggestion',
          category: 'code_quality',
        },
      ];

      const prioritized = prioritizer.prioritizeComments(comments);
      const groups = prioritizer.groupByPriority(prioritized);

      // Verify all comments are categorized
      const totalGrouped =
        groups.critical.length +
        groups.high.length +
        groups.medium.length +
        groups.low.length;
      expect(totalGrouped).toBe(comments.length);
    });
  });

  describe('getTopComments', () => {
    it('should return top N comments by priority', () => {
      const comments: ReviewComment[] = Array.from({ length: 20 }, (_, i) => ({
        file: 'test.ts',
        line: i + 1,
        severity: i % 2 === 0 ? 'error' : 'warning',
        body: `Comment ${i + 1}`,
        category: 'bugs',
      }));

      const prioritized = prioritizer.prioritizeComments(comments);
      const top5 = prioritizer.getTopComments(prioritized, 5);

      expect(top5.length).toBe(5);
      expect(top5[0].priority).toBeGreaterThanOrEqual(top5[4].priority);
    });

    it('should return all comments if limit exceeds count', () => {
      const comments: ReviewComment[] = [
        {
          file: 'test.ts',
          line: 1,
          severity: 'error',
          body: 'Error',
          category: 'bugs',
        },
        {
          file: 'test.ts',
          line: 2,
          severity: 'warning',
          body: 'Warning',
          category: 'bugs',
        },
      ];

      const prioritized = prioritizer.prioritizeComments(comments);
      const top10 = prioritizer.getTopComments(prioritized, 10);

      expect(top10.length).toBe(2);
    });

    it('should return empty array for empty input', () => {
      const top = prioritizer.getTopComments([], 10);

      expect(top.length).toBe(0);
    });
  });
});
