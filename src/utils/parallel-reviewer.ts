import { AIProviderInterface } from '../ai-provider';
import { CodeChunk, ReviewResult } from '../types';
import { ReviewStream } from './review-stream';

export interface ParallelReviewerConfig {
  concurrency: number;
  timeout: number;
}

const DEFAULT_CONFIG: ParallelReviewerConfig = {
  concurrency: 3,
  timeout: 120000, // 2 minutes
};

/**
 * Parallel Reviewer - Manages concurrent AI review batches
 */
export class ParallelReviewer {
  private config: ParallelReviewerConfig;

  constructor(config: Partial<ParallelReviewerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Review batches in parallel with a sliding window concurrency model
   */
  async reviewBatches(
    batches: CodeChunk[][],
    aiProvider: AIProviderInterface,
    globalRules: string[],
    stream?: ReviewStream | undefined,
    criticalFiles: string[] = []
  ): Promise<ReviewResult> {
    const results: ReviewResult[] = new Array<ReviewResult>(batches.length);
    let activeCount = 0;
    let nextIndex = 0;

    return new Promise((resolve) => {
      if (batches.length === 0) {
        resolve(this.createEmptyResult('No batches to review'));
        return;
      }

      const startNextBatch = (): void => {
        if (nextIndex >= batches.length) {
          if (activeCount === 0) {
            const merged = this.mergeResults(results.filter(Boolean));
            if (stream) {
              stream.complete(merged);
            }
            resolve(merged);
          }
          return;
        }

        const currentIndex = nextIndex++;
        const batch = batches[currentIndex];
        if (!batch) return;

        activeCount++;

        const isDeepDive = batch.some((chunk) => criticalFiles.includes(chunk.file));

        this.reviewBatchWithTimeout(batch, aiProvider, globalRules, isDeepDive)
          .then((batchResult) => {
            results[currentIndex] = batchResult;

            if (stream) {
              stream.batchComplete(currentIndex, batchResult.comments, batches.length);
              batchResult.comments.forEach((comment) => stream.emitComment(comment));
            }
          })
          .catch((error) => {
            console.error(`Batch ${currentIndex} failed:`, error);
            results[currentIndex] = this.createEmptyResult(
              error instanceof Error ? error.message : 'Unknown error'
            );
          })
          .finally(() => {
            activeCount--;
            startNextBatch();
          });
      };

      // Start initial batches up to concurrency limit
      const initialBatchCount = Math.min(this.config.concurrency, batches.length);
      for (let i = 0; i < initialBatchCount; i++) {
        startNextBatch();
      }
    });
  }

  /**
   * Review a single batch with timeout
   */
  private async reviewBatchWithTimeout(
    batch: CodeChunk[],
    aiProvider: AIProviderInterface,
    globalRules: string[],
    isDeepDive: boolean = false
  ): Promise<ReviewResult> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(this.createEmptyResult('Review timed out'));
      }, this.config.timeout);

      const reviewPromise = isDeepDive
        ? aiProvider.deepDiveReview(batch, globalRules)
        : aiProvider.reviewCode(batch, globalRules);

      reviewPromise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          resolve(this.createEmptyResult(error instanceof Error ? error.message : 'Unknown error'));
        });
    });
  }

  /**
   * Merge multiple review results into one
   */
  private mergeResults(results: ReviewResult[]): ReviewResult {
    const combined: ReviewResult = {
      comments: [],
      summary: '',
      stats: { errors: 0, warnings: 0, suggestions: 0 },
      topIssues: [],
    };

    const summaries: string[] = [];

    for (const result of results) {
      combined.comments.push(...result.comments);
      combined.stats.errors += result.stats.errors;
      combined.stats.warnings += result.stats.warnings;
      combined.stats.suggestions += result.stats.suggestions;

      if (result.summary) {
        summaries.push(result.summary);
      }

      if (result.topIssues) {
        combined.topIssues?.push(...result.topIssues);
      }
    }

    // Deduplicate comments
    const uniqueComments = new Map<string, (typeof combined.comments)[number]>();
    for (const comment of combined.comments) {
      const key = `${comment.file}:${comment.line}:${comment.body}`;
      uniqueComments.set(key, comment);
    }
    combined.comments = Array.from(uniqueComments.values());

    // Determine recommendation based on merged stats
    if (combined.stats.errors > 0) {
      combined.recommendation = 'BLOCK';
    } else if (combined.stats.warnings > 3) {
      combined.recommendation = 'REQUEST_CHANGES';
    } else if (combined.stats.warnings > 0) {
      combined.recommendation = 'APPROVE_WITH_NITS';
    } else {
      combined.recommendation = 'APPROVE';
    }

    // Extract top issues from comments if none provided by batches
    if ((!combined.topIssues || combined.topIssues.length === 0) && combined.comments.length > 0) {
      combined.topIssues = combined.comments
        .filter((c) => c.severity === 'error' || c.severity === 'warning')
        .slice(0, 5)
        .map((c) => `${c.severity.toUpperCase()}: ${c.body.split('\n')[0]}`);
    }

    // Deduplicate top issues
    if (combined.topIssues) {
      combined.topIssues = Array.from(new Set(combined.topIssues));
    }

    // Combine summaries
    combined.summary =
      summaries.length > 0 ? summaries.join('\n\n---\n\n') : 'No summaries available';

    return combined;
  }

  /**
   * Create an empty review result
   */
  private createEmptyResult(message: string): ReviewResult {
    return {
      comments: [],
      summary: `Review failed or was empty: ${message}`,
      stats: { errors: 0, warnings: 0, suggestions: 0 },
    };
  }
}
