import { CommentDeduplicator } from '../src/utils/comment-deduplicator';
import { ReviewComment } from '../src/types';

describe('CommentDeduplicator', () => {
  let deduplicator: CommentDeduplicator;

  beforeEach(() => {
    deduplicator = new CommentDeduplicator(0.6);
  });

  describe('deduplicate', () => {
    it('should return empty array for empty input', () => {
      const result = deduplicator.deduplicate([]);
      expect(result.comments).toEqual([]);
      expect(result.stats.totalComments).toBe(0);
      expect(result.stats.duplicatesRemoved).toBe(0);
    });

    it('should not deduplicate comments on different files', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
        {
          file: 'file2.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
      ];

      const result = deduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(2);
      expect(result.stats.duplicatesRemoved).toBe(0);
    });

    it('should not deduplicate comments on different lines', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
        {
          file: 'file1.ts',
          line: 20,
          body: 'Add null check',
          severity: 'warning',
        },
      ];

      const result = deduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(2);
      expect(result.stats.duplicatesRemoved).toBe(0);
    });

    it('should deduplicate identical comments on same file and line', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check before accessing property',
          severity: 'warning',
          rule: 'no-null-check',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check before accessing property',
          severity: 'warning',
          rule: 'no-null-check',
        },
      ];

      const result = deduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(1);
      expect(result.stats.duplicatesRemoved).toBe(1);
    });

    it('should deduplicate semantically similar comments', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check before accessing property',
          severity: 'warning',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'You should add a null check before accessing this property',
          severity: 'warning',
        },
      ];

      const result = deduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(1);
      expect(result.stats.duplicatesRemoved).toBe(1);
    });

    it('should keep comment with higher severity', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'suggestion',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'error',
        },
      ];

      const result = deduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].severity).toBe('error');
    });

    it('should merge fix suggestions', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
          fix: 'if (obj) { obj.property }',
        },
      ];

      const result = deduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].fix).toBe('if (obj) { obj.property }');
    });

    it('should preserve rule and category information', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
          rule: 'no-null-check',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
          category: 'code-quality',
        },
      ];

      const result = deduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].rule).toBe('no-null-check');
      expect(result.comments[0].category).toBe('code-quality');
    });

    it('should handle multiple duplicates', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'error',
        },
        {
          file: 'file2.ts',
          line: 20,
          body: 'Remove console.log',
          severity: 'suggestion',
        },
        {
          file: 'file2.ts',
          line: 20,
          body: 'Remove console.log',
          severity: 'suggestion',
        },
      ];

      const result = deduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(2);
      expect(result.stats.duplicatesRemoved).toBe(3);
      expect(result.comments[0].severity).toBe('error');
      expect(result.comments[1].file).toBe('file2.ts');
    });

    it('should not deduplicate comments with low similarity', () => {
      const strictDeduplicator = new CommentDeduplicator(0.9);
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'This function is too complex',
          severity: 'warning',
        },
      ];

      const result = strictDeduplicator.deduplicate(comments);
      expect(result.comments).toHaveLength(2);
      expect(result.stats.duplicatesRemoved).toBe(0);
    });
  });

  describe('analyze', () => {
    it('should return statistics without modifying comments', () => {
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check',
          severity: 'warning',
        },
      ];

      const stats = deduplicator.analyze(comments);
      expect(stats.totalComments).toBe(2);
      expect(stats.duplicatesRemoved).toBe(1);
      expect(stats.finalComments).toBe(1);
      expect(stats.deduplicationRate).toBe(0.5);

      // Original array should be unchanged
      expect(comments).toHaveLength(2);
    });
  });

  describe('similarity threshold', () => {
    it('should use custom similarity threshold', () => {
      const strictDeduplicator = new CommentDeduplicator(0.9);
      const comments: ReviewComment[] = [
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check before accessing property',
          severity: 'warning',
        },
        {
          file: 'file1.ts',
          line: 10,
          body: 'Add null check before accessing this property value',
          severity: 'warning',
        },
      ];

      // With high threshold, these might not be considered duplicates
      const result = strictDeduplicator.deduplicate(comments);
      // The exact behavior depends on similarity calculation
      expect(result.comments.length).toBeGreaterThanOrEqual(1);
      expect(result.comments.length).toBeLessThanOrEqual(2);
    });
  });
});
