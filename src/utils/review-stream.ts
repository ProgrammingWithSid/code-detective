/**
 * Review Streaming
 * Enables progressive posting of review comments as they are generated
 */

import { ReviewComment, ReviewResult } from '../types';

export interface ReviewProgress {
  totalBatches: number;
  completedBatches: number;
  currentBatch: number;
  percentage: number;
  estimatedTimeRemaining?: number; // milliseconds
}

export interface ReviewStreamCallbacks {
  onComment?: (comment: ReviewComment) => void;
  onProgress?: (progress: ReviewProgress) => void;
  onBatchComplete?: (batchIndex: number, comments: ReviewComment[]) => void;
  onComplete?: (result: ReviewResult) => void;
  onError?: (error: Error) => void;
}

export class ReviewStream {
  private callbacks: ReviewStreamCallbacks;
  private startTime: number = 0;
  private batchTimes: number[] = [];

  constructor(callbacks: ReviewStreamCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Start streaming review progress
   */
  start(totalBatches: number): void {
    this.startTime = Date.now();
    this.batchTimes = [];
    this.emitProgress({
      totalBatches,
      completedBatches: 0,
      currentBatch: 0,
      percentage: 0,
    });
  }

  /**
   * Emit a comment as soon as it's generated
   */
  emitComment(comment: ReviewComment): void {
    if (this.callbacks.onComment) {
      this.callbacks.onComment(comment);
    }
  }

  /**
   * Emit progress update
   */
  emitProgress(progress: ReviewProgress): void {
    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(progress);
    }
  }

  /**
   * Mark a batch as complete
   */
  batchComplete(batchIndex: number, comments: ReviewComment[], totalBatches?: number): void {
    const batchTime = Date.now() - this.startTime;
    this.batchTimes.push(batchTime);

    const totalBatchesCount = totalBatches || this.batchTimes.length;
    const progress: ReviewProgress = {
      totalBatches: totalBatchesCount,
      completedBatches: this.batchTimes.length,
      currentBatch: batchIndex + 1,
      percentage: Math.round((this.batchTimes.length / totalBatchesCount) * 100),
    };

    // Estimate time remaining based on average batch time
    if (this.batchTimes.length > 0 && totalBatchesCount > this.batchTimes.length) {
      const avgBatchTime = this.batchTimes.reduce((a, b) => a + b, 0) / this.batchTimes.length;
      const remainingBatches = totalBatchesCount - this.batchTimes.length;
      progress.estimatedTimeRemaining = Math.round(avgBatchTime * remainingBatches);
    }

    this.emitProgress(progress);

    if (this.callbacks.onBatchComplete) {
      this.callbacks.onBatchComplete(batchIndex, comments);
    }
  }

  /**
   * Mark review as complete
   */
  complete(result: ReviewResult): void {
    const finalProgress: ReviewProgress = {
      totalBatches: this.batchTimes.length,
      completedBatches: this.batchTimes.length,
      currentBatch: this.batchTimes.length,
      percentage: 100,
    };

    this.emitProgress(finalProgress);

    if (this.callbacks.onComplete) {
      this.callbacks.onComplete(result);
    }
  }

  /**
   * Emit an error
   */
  error(error: Error): void {
    if (this.callbacks.onError) {
      this.callbacks.onError(error);
    }
  }
}
