import * as crypto from 'crypto';
import { CodeChunk, ReviewResult } from '../types';

/**
 * Cache entry for review results
 */
interface CachedReview {
  result: ReviewResult;
  timestamp: number;
  ttl: number;
}

/**
 * Review cache for storing AI review results
 * Reduces redundant AI API calls for unchanged code
 */
export class ReviewCache {
  private cache: Map<string, CachedReview> = new Map();
  private ttl: number; // Time to live in milliseconds
  private maxSize: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(ttl: number = 24 * 60 * 60 * 1000, maxSize: number = 500) {
    // Default: 24 hours TTL, max 500 cached reviews
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  /**
   * Generate cache key from chunks
   * Uses chunk IDs and content hashes to create a stable key
   */
  generateCacheKey(chunks: CodeChunk[]): string {
    // Create hash from chunk IDs and content hashes
    const chunkHashes = chunks
      .map((c) => {
        const contentHash = c.content ? this.hashContent(c.content) : '';
        return `${c.id}:${c.hash || contentHash}`;
      })
      .sort()
      .join('|');

    return this.hash(chunkHashes);
  }

  /**
   * Get cached review result
   */
  get(key: string): ReviewResult | null {
    const cached = this.cache.get(key);
    if (!cached) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.stats.misses++;
      this.cache.delete(key);
      return null;
    }

    this.stats.hits++;
    return cached.result;
  }

  /**
   * Set cached review result
   */
  set(key: string, result: ReviewResult, ttl?: number): void {
    // Evict if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      ttl: ttl || this.ttl,
    });
  }

  /**
   * Invalidate cache for a specific key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
    size: number;
    maxSize: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Hash content string
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Hash string
   */
  private hash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
}
