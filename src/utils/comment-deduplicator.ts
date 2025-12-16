/**
 * Comment Deduplicator - Removes duplicate comments from rule-based and AI reviews
 *
 * Matches comments by:
 * - File and line number (exact match)
 * - Semantic similarity of message body
 *
 * When duplicates are found:
 * - Keeps the comment with highest severity
 * - Merges fix suggestions if available
 * - Preserves rule/category information
 */

import { ReviewComment, Severity } from '../types';

interface DeduplicationStats {
  totalComments: number;
  duplicatesRemoved: number;
  finalComments: number;
  deduplicationRate: number;
}

/**
 * Severity priority (higher number = higher priority)
 */
const SEVERITY_PRIORITY: Record<Severity, number> = {
  error: 4,
  warning: 3,
  info: 2,
  suggestion: 1,
};

/**
 * Calculate similarity between two strings using simple word overlap
 * Returns a score between 0 and 1
 */
function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .join(' ');

  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Check if two comments are duplicates
 */
function areDuplicates(
  comment1: ReviewComment,
  comment2: ReviewComment,
  similarityThreshold: number = 0.6
): boolean {
  // Must be same file and line
  if (comment1.file !== comment2.file || comment1.line !== comment2.line) {
    return false;
  }

  // Check semantic similarity
  const similarity = calculateSimilarity(comment1.body, comment2.body);
  return similarity >= similarityThreshold;
}

/**
 * Merge two duplicate comments
 * Keeps the comment with higher severity and merges other properties
 */
function mergeComments(comment1: ReviewComment, comment2: ReviewComment): ReviewComment {
  const priority1 = SEVERITY_PRIORITY[comment1.severity];
  const priority2 = SEVERITY_PRIORITY[comment2.severity];

  // Keep the comment with higher severity
  const baseComment = priority1 >= priority2 ? comment1 : comment2;
  const otherComment = priority1 >= priority2 ? comment2 : comment1;

  // Merge properties
  return {
    ...baseComment,
    // Use the longer/more detailed body
    body:
      baseComment.body.length >= otherComment.body.length ? baseComment.body : otherComment.body,
    // Merge fix suggestions (prefer non-empty)
    fix: baseComment.fix || otherComment.fix,
    // Preserve rule if available
    rule: baseComment.rule || otherComment.rule,
    // Preserve category if available
    category: baseComment.category || otherComment.category,
  };
}

export class CommentDeduplicator {
  private similarityThreshold: number;

  constructor(similarityThreshold: number = 0.6) {
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Deduplicate comments
   * @param comments - Array of comments to deduplicate
   * @returns Deduplicated comments and statistics
   */
  deduplicate(comments: ReviewComment[]): {
    comments: ReviewComment[];
    stats: DeduplicationStats;
  } {
    if (comments.length === 0) {
      return {
        comments: [],
        stats: {
          totalComments: 0,
          duplicatesRemoved: 0,
          finalComments: 0,
          deduplicationRate: 0,
        },
      };
    }

    const deduplicated: ReviewComment[] = [];
    const processed = new Set<number>();
    let duplicatesRemoved = 0;

    for (let i = 0; i < comments.length; i++) {
      if (processed.has(i)) continue;

      const currentComment = comments[i];
      if (!currentComment) continue;

      let mergedComment = currentComment;
      processed.add(i);

      // Check for duplicates with remaining comments
      for (let j = i + 1; j < comments.length; j++) {
        if (processed.has(j)) continue;

        const otherComment = comments[j];
        if (!otherComment) continue;

        if (areDuplicates(mergedComment, otherComment, this.similarityThreshold)) {
          mergedComment = mergeComments(mergedComment, otherComment);
          processed.add(j);
          duplicatesRemoved++;
        }
      }

      deduplicated.push(mergedComment);
    }

    const stats: DeduplicationStats = {
      totalComments: comments.length,
      duplicatesRemoved,
      finalComments: deduplicated.length,
      deduplicationRate: comments.length > 0 ? duplicatesRemoved / comments.length : 0,
    };

    return { comments: deduplicated, stats };
  }

  /**
   * Get deduplication statistics without modifying comments
   */
  analyze(comments: ReviewComment[]): DeduplicationStats {
    const { stats } = this.deduplicate(comments);
    return stats;
  }
}

/**
 * Create a CommentDeduplicator instance
 */
export function createCommentDeduplicator(similarityThreshold?: number): CommentDeduplicator {
  return new CommentDeduplicator(similarityThreshold);
}
