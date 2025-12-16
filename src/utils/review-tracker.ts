/**
 * Review Tracker - Tracks reviewed chunks for incremental reviews
 *
 * Stores chunk hashes that have been reviewed to enable:
 * - Skipping unchanged chunks in subsequent reviews
 * - Tracking review history per PR/branch
 * - Reducing API costs and review time
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CodeChunk } from '../types';

interface ReviewedChunk {
  hash: string;
  file: string;
  startLine: number;
  endLine: number;
  reviewedAt: number;
  reviewHash?: string; // Hash of the review result (for detecting review changes)
}

interface ReviewState {
  branch: string;
  baseBranch?: string;
  reviewedChunks: ReviewedChunk[];
  lastReviewedAt: number;
}

interface TrackerStats {
  totalChunks: number;
  reviewedChunks: number;
  newChunks: number;
  changedChunks: number;
  skippedChunks: number;
  skipRate: number;
}

export class ReviewTracker {
  private storagePath: string;
  private stateFile: string;
  private maxHistorySize: number;

  constructor(storagePath: string = '.sherlock-reviews', maxHistorySize: number = 10000) {
    this.storagePath = path.resolve(storagePath);
    this.stateFile = path.join(this.storagePath, 'review-state.json');
    this.maxHistorySize = maxHistorySize;
    this.ensureStorageDirectory();
  }

  private ensureStorageDirectory(): void {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
    } catch (error) {
      // Silently fail - storage directory creation may fail in restricted environments
      // The tracker will still work, but state won't be persisted
    }
  }

  /**
   * Generate hash for content
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Generate hash for a chunk
   */
  private generateChunkHash(chunk: CodeChunk): string {
    // Use chunk hash if available, otherwise generate from content
    if (chunk.hash) {
      return chunk.hash;
    }
    return this.generateContentHash(chunk.content);
  }

  /**
   * Generate hash for review result (to detect if review changed)
   */
  private generateReviewHash(
    comments: Array<{ file: string; line: number; body: string }>
  ): string {
    const reviewContent = comments
      .map((c) => `${c.file}:${c.line}:${c.body}`)
      .sort()
      .join('|');
    return this.generateContentHash(reviewContent);
  }

  /**
   * Load review state for a branch
   * @returns The state and whether it was loaded from file (true) or created new (false)
   */
  private loadState(
    branch: string,
    baseBranch?: string
  ): { state: ReviewState; fromFile: boolean } {
    if (!fs.existsSync(this.stateFile)) {
      return {
        state: {
          branch,
          baseBranch,
          reviewedChunks: [],
          lastReviewedAt: 0,
        },
        fromFile: false,
      };
    }

    try {
      const content = fs.readFileSync(this.stateFile, 'utf-8');
      const state = JSON.parse(content) as ReviewState;

      // If branch or base branch changed, return new state (don't modify existing)
      if (state.branch !== branch || state.baseBranch !== baseBranch) {
        return {
          state: {
            branch,
            baseBranch,
            reviewedChunks: [],
            lastReviewedAt: 0,
          },
          fromFile: false,
        };
      }

      return { state, fromFile: true };
    } catch (error) {
      // Silently handle errors - return empty state
      return {
        state: {
          branch,
          baseBranch,
          reviewedChunks: [],
          lastReviewedAt: 0,
        },
        fromFile: false,
      };
    }
  }

  /**
   * Save review state
   */
  private saveState(state: ReviewState): void {
    try {
      // Ensure directory exists before writing
      this.ensureStorageDirectory();

      // Limit history size
      if (state.reviewedChunks.length > this.maxHistorySize) {
        state.reviewedChunks = state.reviewedChunks
          .sort((a, b) => b.reviewedAt - a.reviewedAt)
          .slice(0, this.maxHistorySize);
      }

      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      // Silently fail - state persistence may fail in restricted environments
    }
  }

  /**
   * Filter chunks to only those that need review
   * @param chunks - Chunks to check
   * @param branch - Current branch
   * @param baseBranch - Base branch (optional)
   * @returns Object with chunks to review and statistics
   */
  filterChunksForReview(
    chunks: CodeChunk[],
    branch: string,
    baseBranch?: string
  ): {
    chunksToReview: CodeChunk[];
    stats: TrackerStats;
  } {
    const { state } = this.loadState(branch, baseBranch);
    const reviewedMap = new Map<string, ReviewedChunk>();

    // Build map of reviewed chunks by hash
    for (const reviewed of state.reviewedChunks) {
      reviewedMap.set(reviewed.hash, reviewed);
    }

    const chunksToReview: CodeChunk[] = [];
    let reviewedCount = 0;
    let newCount = 0;
    let changedCount = 0;

    for (const chunk of chunks) {
      const chunkHash = this.generateChunkHash(chunk);
      const reviewed = reviewedMap.get(chunkHash);

      if (!reviewed) {
        // New chunk - needs review
        chunksToReview.push(chunk);
        newCount++;
      } else {
        // Check if chunk content changed (line ranges)
        const contentChanged =
          reviewed.file !== chunk.file ||
          reviewed.startLine !== chunk.startLine ||
          reviewed.endLine !== chunk.endLine;

        if (contentChanged) {
          // Chunk changed - needs review
          chunksToReview.push(chunk);
          changedCount++;
        } else {
          // Chunk unchanged - skip
          reviewedCount++;
        }
      }
    }

    const stats: TrackerStats = {
      totalChunks: chunks.length,
      reviewedChunks: reviewedCount,
      newChunks: newCount,
      changedChunks: changedCount,
      skippedChunks: reviewedCount,
      skipRate: chunks.length > 0 ? reviewedCount / chunks.length : 0,
    };

    return { chunksToReview, stats };
  }

  /**
   * Mark chunks as reviewed
   * @param chunks - Chunks that were reviewed
   * @param comments - Review comments (optional, for review hash)
   * @param branch - Current branch
   * @param baseBranch - Base branch (optional)
   */
  markAsReviewed(
    chunks: CodeChunk[],
    comments: Array<{ file: string; line: number; body: string }> = [],
    branch: string,
    baseBranch?: string
  ): void {
    const { state } = this.loadState(branch, baseBranch);
    const reviewHash = comments.length > 0 ? this.generateReviewHash(comments) : undefined;
    const now = Date.now();

    // Update or add reviewed chunks
    const reviewedMap = new Map<string, ReviewedChunk>();

    // Keep existing reviewed chunks
    for (const reviewed of state.reviewedChunks) {
      reviewedMap.set(reviewed.hash, reviewed);
    }

    // Add/update chunks that were just reviewed
    for (const chunk of chunks) {
      const chunkHash = this.generateChunkHash(chunk);
      reviewedMap.set(chunkHash, {
        hash: chunkHash,
        file: chunk.file,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        reviewedAt: now,
        reviewHash,
      });
    }

    state.reviewedChunks = Array.from(reviewedMap.values());
    state.lastReviewedAt = now;
    this.saveState(state);
  }

  /**
   * Clear review state for a branch
   */
  clearState(branch: string, baseBranch?: string): void {
    const { state, fromFile } = this.loadState(branch, baseBranch);
    // Only clear and save if this state was actually loaded from file
    // (meaning it matches the requested branch)
    if (fromFile && state.branch === branch && state.baseBranch === baseBranch) {
      state.reviewedChunks = [];
      state.lastReviewedAt = 0;
      this.saveState(state);
    }
    // If fromFile is false, the branch doesn't exist in the file, so nothing to clear
  }

  /**
   * Get statistics for a branch
   */
  getStats(
    branch: string,
    baseBranch?: string
  ): {
    totalReviewed: number;
    lastReviewedAt: number;
  } {
    const { state } = this.loadState(branch, baseBranch);
    return {
      totalReviewed: state.reviewedChunks.length,
      lastReviewedAt: state.lastReviewedAt,
    };
  }

  /**
   * Clear all review history
   */
  clearAll(): void {
    if (fs.existsSync(this.stateFile)) {
      fs.unlinkSync(this.stateFile);
    }
  }
}

/**
 * Create a ReviewTracker instance
 */
export function createReviewTracker(storagePath?: string, maxHistorySize?: number): ReviewTracker {
  return new ReviewTracker(storagePath, maxHistorySize);
}
