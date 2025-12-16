import { AIProviderInterface } from '../ai-provider';
import { CodeChunk, ReviewComment, ReviewResult } from '../types';
import type { ReviewStream } from './review-stream';

/**
 * Configuration for parallel review processing
 */
export interface ParallelReviewConfig {
  /** Maximum concurrent batches */
  concurrency: number;
  /** Timeout per batch in milliseconds */
  timeout: number;
}

/**
 * Default parallel review configuration
 */
const DEFAULT_CONFIG: ParallelReviewConfig = {
  concurrency: 3,
  timeout: 60000, // 60 seconds
};

/**
 * Parallel reviewer for processing multiple batches concurrently
 */
export class ParallelReviewer {
  private config: ParallelReviewConfig;

  constructor(config: Partial<ParallelReviewConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Review batches in parallel
   */
  async reviewBatches(
    batches: CodeChunk[][],
    aiProvider: AIProviderInterface,
    globalRules: string[],
    stream?: ReviewStream | undefined
  ): Promise<ReviewResult> {
    const results: ReviewResult[] = [];

    // Process batches in parallel with concurrency limit
    for (let i = 0; i < batches.length; i += this.config.concurrency) {
      const batchGroup = batches.slice(i, i + this.config.concurrency);

      const batchResults = await Promise.all(
        batchGroup.map((batch) => this.reviewBatchWithTimeout(batch, aiProvider, globalRules))
      );

      // Emit batch completion for streaming
      if (stream) {
        for (let j = 0; j < batchResults.length; j++) {
          const batchIndex = i + j;
          const batchResult = batchResults[j];
          if (batchResult) {
            const batchComments = batchResult.comments;
            stream.batchComplete(batchIndex, batchComments, batches.length);
            // Emit individual comments
            batchComments.forEach((comment) => stream.emitComment(comment));
          }
        }
      }

      results.push(...batchResults);
    }

    // Merge results
    const merged = this.mergeResults(results);
    if (stream) {
      stream.complete(merged);
    }
    return merged;
  }

  /**
   * Review a single batch with timeout
   */
  private async reviewBatchWithTimeout(
    batch: CodeChunk[],
    aiProvider: AIProviderInterface,
    globalRules: string[]
  ): Promise<ReviewResult> {
    const timeoutPromise = new Promise<ReviewResult>((_, reject) => {
      setTimeout(() => reject(new Error('Review timeout')), this.config.timeout);
    });

    const reviewPromise = aiProvider.reviewCode(batch, globalRules);

    try {
      return await Promise.race([reviewPromise, timeoutPromise]);
    } catch (error) {
      // Return empty result on timeout or error
      return this.createEmptyResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Merge multiple review results into one
   */
  private mergeResults(results: ReviewResult[]): ReviewResult {
    const merged: ReviewResult = {
      comments: [],
      summary: '',
      stats: { errors: 0, warnings: 0, suggestions: 0 },
      recommendation: 'APPROVE',
      topIssues: [],
    };

    // Collect all comments
    for (const result of results) {
      merged.comments.push(...result.comments);
      merged.stats.errors += result.stats.errors;
      merged.stats.warnings += result.stats.warnings;
      merged.stats.suggestions += result.stats.suggestions;
    }

    // Deduplicate comments
    merged.comments = this.deduplicateComments(merged.comments);

    // Build summary
    merged.summary = this.buildSummary(merged);
    merged.recommendation = this.determineRecommendation(merged.stats);

    // Extract top issues
    merged.topIssues = this.extractTopIssues(merged.comments);

    return merged;
  }

  /**
   * Deduplicate comments based on file, line, and message
   */
  private deduplicateComments(comments: ReviewComment[]): ReviewComment[] {
    const seen = new Set<string>();
    const unique: ReviewComment[] = [];

    for (const comment of comments) {
      const key = `${comment.file}:${comment.line}:${comment.body.substring(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(comment);
      }
    }

    return unique;
  }

  /**
   * Build summary from merged results
   */
  private buildSummary(result: ReviewResult): string {
    const totalIssues = result.stats.errors + result.stats.warnings + result.stats.suggestions;

    if (totalIssues === 0) {
      return '✅ No issues found. Code looks good!';
    }

    const parts: string[] = [];
    if (result.stats.errors > 0) {
      parts.push(`${result.stats.errors} error(s)`);
    }
    if (result.stats.warnings > 0) {
      parts.push(`${result.stats.warnings} warning(s)`);
    }
    if (result.stats.suggestions > 0) {
      parts.push(`${result.stats.suggestions} suggestion(s)`);
    }

    return `Found ${parts.join(', ')}.`;
  }

  /**
   * Determine overall recommendation based on stats
   */
  private determineRecommendation(stats: ReviewResult['stats']): string {
    if (stats.errors > 0) {
      return 'BLOCK';
    }
    if (stats.warnings > 5) {
      return 'REQUEST_CHANGES';
    }
    if (stats.warnings > 0 || stats.suggestions > 0) {
      return 'APPROVE_WITH_NITS';
    }
    return 'APPROVE';
  }

  /**
   * Extract top issues from comments
   */
  private extractTopIssues(comments: ReviewComment[]): string[] {
    // Sort by severity (error > warning > suggestion)
    const severityOrder = { error: 3, warning: 2, suggestion: 1, info: 0 };
    const sorted = [...comments].sort(
      (a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0)
    );

    // Extract top 5 issues
    return sorted.slice(0, 5).map((c) => {
      const preview = c.body.substring(0, 100);
      return `${c.file}:${c.line} - ${preview}${preview.length < c.body.length ? '...' : ''}`;
    });
  }

  /**
   * Create empty result for errors
   */
  private createEmptyResult(message: string): ReviewResult {
    return {
      comments: [],
      summary: `Review failed: ${message}`,
      stats: { errors: 0, warnings: 0, suggestions: 0 },
      recommendation: 'APPROVE',
      topIssues: [],
    };
  }
}
