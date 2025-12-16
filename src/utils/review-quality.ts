/**
 * Review Quality Scoring and Metrics
 * Calculates quality scores based on review accuracy, actionability, and coverage
 */

import { ReviewComment, ReviewResult } from '../types';

export interface ReviewQualityMetrics {
  accuracy: number; // Based on feedback (0-100)
  actionability: number; // Fix rate (0-100)
  coverage: number; // % of code reviewed (0-100)
  precision: number; // True positives / (True + False positives) (0-100)
  recall: number; // True positives / (True positives + False negatives) (0-100)
  overallScore: number; // Weighted average (0-100)
  confidence: number; // Average confidence across comments (0-100)
}

export interface CommentConfidence {
  commentId: string;
  confidence: 'high' | 'medium' | 'low';
  score: number; // 0-100
}

export interface QualityFeedback {
  commentId: string;
  accepted: boolean; // true if accepted, false if dismissed
  fixed: boolean; // true if issue was fixed
  timestamp: Date;
}

export class ReviewQualityScorer {
  private feedbackHistory: Map<string, QualityFeedback[]> = new Map();

  /**
   * Record feedback for a comment to improve quality scoring
   */
  recordFeedback(commentId: string, feedback: QualityFeedback): void {
    if (!this.feedbackHistory.has(commentId)) {
      this.feedbackHistory.set(commentId, []);
    }
    this.feedbackHistory.get(commentId)!.push(feedback);
  }

  /**
   * Calculate quality metrics for a review result
   */
  calculateQualityMetrics(
    result: ReviewResult,
    totalChunks: number,
    reviewedChunks: number,
    feedback?: Map<string, QualityFeedback>
  ): ReviewQualityMetrics {
    const comments = result.comments;

    // Calculate coverage
    const coverage = totalChunks > 0 ? (reviewedChunks / totalChunks) * 100 : 0;

    // Calculate actionability (fix rate) from feedback
    let actionability = 0;
    if (feedback && feedback.size > 0) {
      const fixedCount = Array.from(feedback.values()).filter((f) => f.fixed).length;
      actionability = (fixedCount / feedback.size) * 100;
    }

    // Calculate accuracy (acceptance rate) from feedback
    let accuracy = 0;
    if (feedback && feedback.size > 0) {
      const acceptedCount = Array.from(feedback.values()).filter((f) => f.accepted).length;
      accuracy = (acceptedCount / feedback.size) * 100;
    }

    // Calculate precision (if we have feedback)
    let precision = 0;
    if (feedback && feedback.size > 0) {
      const truePositives = Array.from(feedback.values()).filter(
        (f) => f.accepted && f.fixed
      ).length;
      const falsePositives = Array.from(feedback.values()).filter((f) => !f.accepted).length;
      const totalPositives = truePositives + falsePositives;
      precision = totalPositives > 0 ? (truePositives / totalPositives) * 100 : 0;
    }

    // Calculate recall (requires knowing total issues - approximated)
    let recall = 0;
    if (feedback && feedback.size > 0) {
      const truePositives = Array.from(feedback.values()).filter(
        (f) => f.accepted && f.fixed
      ).length;
      // Estimate false negatives as dismissed comments that were later fixed
      const falseNegatives = Array.from(feedback.values()).filter(
        (f) => !f.accepted && f.fixed
      ).length;
      const totalActualIssues = truePositives + falseNegatives;
      recall = totalActualIssues > 0 ? (truePositives / totalActualIssues) * 100 : 0;
    }

    // Calculate average confidence
    const confidence = this.calculateAverageConfidence(comments);

    // Calculate overall score (weighted average)
    const overallScore = this.calculateOverallScore({
      accuracy,
      actionability,
      coverage,
      precision,
      recall,
      confidence,
    });

    return {
      accuracy,
      actionability,
      coverage,
      precision,
      recall,
      overallScore,
      confidence,
    };
  }

  /**
   * Calculate confidence levels for comments based on severity and category
   */
  calculateCommentConfidence(comment: ReviewComment): CommentConfidence {
    let confidenceScore = 50; // Base score

    // Higher confidence for errors and security issues
    if (comment.severity === 'error') {
      confidenceScore += 30;
    } else if (comment.severity === 'warning') {
      confidenceScore += 15;
    } else if (comment.severity === 'suggestion' || comment.severity === 'info') {
      confidenceScore -= 10;
    }

    // Higher confidence for security and bugs
    if (comment.category === 'security' || comment.category === 'bugs') {
      confidenceScore += 20;
    }

    // Lower confidence if no fix suggestion
    if (!comment.fix) {
      confidenceScore -= 15;
    }

    // Clamp to 0-100
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));

    let confidenceLevel: 'high' | 'medium' | 'low';
    if (confidenceScore >= 70) {
      confidenceLevel = 'high';
    } else if (confidenceScore >= 40) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
    }

    return {
      commentId: `${comment.file}:${comment.line}`,
      confidence: confidenceLevel,
      score: confidenceScore,
    };
  }

  /**
   * Calculate average confidence across all comments
   */
  private calculateAverageConfidence(comments: ReviewComment[]): number {
    if (comments.length === 0) {
      return 0;
    }

    const totalConfidence = comments.reduce((sum, comment) => {
      const conf = this.calculateCommentConfidence(comment);
      return sum + conf.score;
    }, 0);

    return totalConfidence / comments.length;
  }

  /**
   * Calculate overall quality score using weighted average
   */
  private calculateOverallScore(metrics: Omit<ReviewQualityMetrics, 'overallScore'>): number {
    // Weights for different metrics
    const weights = {
      accuracy: 0.25, // 25% - Most important
      actionability: 0.2, // 20% - High value
      precision: 0.2, // 20% - Important for trust
      recall: 0.15, // 15% - Important but less critical
      coverage: 0.1, // 10% - Good to have
      confidence: 0.1, // 10% - Supporting metric
    };

    const weightedSum =
      metrics.accuracy * weights.accuracy +
      metrics.actionability * weights.actionability +
      metrics.precision * weights.precision +
      metrics.recall * weights.recall +
      metrics.coverage * weights.coverage +
      metrics.confidence * weights.confidence;

    return Math.round(weightedSum * 100) / 100;
  }

  /**
   * Get quality trends over time (requires historical data)
   */
  getQualityTrends(
    metricsHistory: ReviewQualityMetrics[],
    days: number = 30
  ): {
    trend: 'improving' | 'declining' | 'stable';
    averageScore: number;
    change: number; // Percentage change
  } {
    if (metricsHistory.length === 0) {
      return {
        trend: 'stable',
        averageScore: 0,
        change: 0,
      };
    }

    const recentMetrics = metricsHistory.slice(-days);
    const olderMetrics = metricsHistory.slice(0, -days);

    const recentAverage =
      recentMetrics.reduce((sum, m) => sum + m.overallScore, 0) / recentMetrics.length;
    const olderAverage =
      olderMetrics.length > 0
        ? olderMetrics.reduce((sum, m) => sum + m.overallScore, 0) / olderMetrics.length
        : recentAverage;

    const change = olderAverage > 0 ? ((recentAverage - olderAverage) / olderAverage) * 100 : 0;

    let trend: 'improving' | 'declining' | 'stable';
    if (change > 5) {
      trend = 'improving';
    } else if (change < -5) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return {
      trend,
      averageScore: recentAverage,
      change: Math.round(change * 100) / 100,
    };
  }
}
