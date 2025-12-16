/**
 * Comment Prioritization
 * Prioritizes review comments to show most critical issues first
 */

import { ReviewComment, Severity } from '../types';

export interface PrioritizedComment extends ReviewComment {
  priority: number; // 0-100, higher = more important
  priorityReason: string; // Why this comment has this priority
}

export class CommentPrioritizer {
  /**
   * Prioritize comments by severity, category, and context
   */
  prioritizeComments(comments: ReviewComment[]): PrioritizedComment[] {
    return comments
      .map((comment) => this.calculatePriority(comment))
      .sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  /**
   * Calculate priority score for a comment
   */
  private calculatePriority(comment: ReviewComment): PrioritizedComment {
    let priority = 0;
    const reasons: string[] = [];

    // Severity-based priority (highest weight)
    const severityWeight = this.getSeverityWeight(comment.severity);
    priority += severityWeight.score;
    reasons.push(severityWeight.reason);

    // Category-based priority
    const categoryWeight = this.getCategoryWeight(comment.category);
    priority += categoryWeight.score;
    if (categoryWeight.reason) {
      reasons.push(categoryWeight.reason);
    }

    // Fix availability increases priority (actionable comments are more important)
    if (comment.fix) {
      priority += 10;
      reasons.push('Has fix suggestion');
    }

    // Rule-based comments have lower priority (already caught by static analysis)
    if (comment.rule && comment.rule.startsWith('rule:')) {
      priority -= 5;
      reasons.push('Rule-based detection');
    }

    // Clamp priority to 0-100
    priority = Math.max(0, Math.min(100, priority));

    return {
      ...comment,
      priority: Math.round(priority),
      priorityReason: reasons.join(', '),
    };
  }

  /**
   * Get priority weight based on severity
   */
  private getSeverityWeight(severity: Severity): { score: number; reason: string } {
    const weights: Record<Severity, { score: number; reason: string }> = {
      error: { score: 50, reason: 'Error severity' },
      warning: { score: 30, reason: 'Warning severity' },
      info: { score: 15, reason: 'Info severity' },
      suggestion: { score: 10, reason: 'Suggestion severity' },
    };

    return weights[severity] || { score: 10, reason: 'Unknown severity' };
  }

  /**
   * Get priority weight based on category
   */
  private getCategoryWeight(category?: string): { score: number; reason: string | null } {
    if (!category) {
      return { score: 0, reason: null };
    }

    const categoryWeights: Record<string, { score: number; reason: string }> = {
      security: { score: 25, reason: 'Security issue' },
      bugs: { score: 20, reason: 'Bug detection' },
      performance: { score: 15, reason: 'Performance issue' },
      architecture: { score: 10, reason: 'Architecture concern' },
      code_quality: { score: 5, reason: 'Code quality' },
    };

    return categoryWeights[category] || { score: 0, reason: null };
  }

  /**
   * Group comments by priority level
   */
  groupByPriority(comments: PrioritizedComment[]): {
    critical: PrioritizedComment[];
    high: PrioritizedComment[];
    medium: PrioritizedComment[];
    low: PrioritizedComment[];
  } {
    return {
      critical: comments.filter((c) => c.priority >= 70),
      high: comments.filter((c) => c.priority >= 50 && c.priority < 70),
      medium: comments.filter((c) => c.priority >= 30 && c.priority < 50),
      low: comments.filter((c) => c.priority < 30),
    };
  }

  /**
   * Get top N most critical comments
   */
  getTopComments(comments: PrioritizedComment[], limit: number = 10): PrioritizedComment[] {
    return comments.slice(0, limit);
  }
}
