import { CodeChunk } from '../types';

/**
 * Configuration for chunk batching
 */
export interface BatchConfig {
  /** Maximum tokens per batch */
  maxTokens: number;
  /** Maximum chunks per batch */
  maxChunks: number;
  /** Group chunks by file */
  groupByFile: boolean;
  /** Include dependencies in batches */
  includeDependencies: boolean;
}

/**
 * Default batch configuration
 */
const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxTokens: 8000, // Conservative limit for most AI models
  maxChunks: 50,
  groupByFile: true,
  includeDependencies: false,
};

/**
 * Intelligent chunk batcher for AI reviews
 * Groups related chunks together and respects token limits
 */
export class ChunkBatcher {
  private config: BatchConfig;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  /**
   * Batch chunks intelligently for AI review
   */
  batchChunks(chunks: CodeChunk[]): CodeChunk[][] {
    const batches: CodeChunk[][] = [];
    let currentBatch: CodeChunk[] = [];
    let currentTokens = 0;

    // Sort chunks by priority score if present (highest first)
    const sortedChunks = [...chunks].sort(
      (a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)
    );

    // Group by file first if enabled
    const groupedChunks = this.config.groupByFile ? this.groupByFile(sortedChunks) : [sortedChunks];

    for (const group of groupedChunks) {
      for (const chunk of group) {
        const chunkTokens = this.estimateTokens(chunk);

        // Check if adding this chunk would exceed limits
        if (
          currentBatch.length >= this.config.maxChunks ||
          currentTokens + chunkTokens > this.config.maxTokens
        ) {
          // Start new batch
          if (currentBatch.length > 0) {
            batches.push(currentBatch);
          }
          currentBatch = [chunk];
          currentTokens = chunkTokens;
        } else {
          currentBatch.push(chunk);
          currentTokens += chunkTokens;
        }
      }
    }

    // Add remaining batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Group chunks by file
   */
  private groupByFile(chunks: CodeChunk[]): CodeChunk[][] {
    const fileMap = new Map<string, CodeChunk[]>();

    for (const chunk of chunks) {
      const fileChunks = fileMap.get(chunk.file) || [];
      fileChunks.push(chunk);
      fileMap.set(chunk.file, fileChunks);
    }

    return Array.from(fileMap.values());
  }

  /**
   * Estimate token count for a chunk
   * Rough estimate: 1 token ≈ 4 characters
   */
  private estimateTokens(chunk: CodeChunk): number {
    if (!chunk.content) {
      // Estimate from line count if no content
      const lineCount = chunk.endLine - chunk.startLine + 1;
      return Math.ceil(lineCount * 10); // ~10 tokens per line
    }

    // Estimate from content length
    return Math.ceil(chunk.content.length / 4);
  }

  /**
   * Get batch statistics
   */
  getBatchStats(batches: CodeChunk[][]): {
    totalBatches: number;
    averageBatchSize: number;
    averageTokensPerBatch: number;
    largestBatch: number;
    smallestBatch: number;
  } {
    if (batches.length === 0) {
      return {
        totalBatches: 0,
        averageBatchSize: 0,
        averageTokensPerBatch: 0,
        largestBatch: 0,
        smallestBatch: 0,
      };
    }

    const batchSizes = batches.map((batch) => batch.length);
    const batchTokens = batches.map((batch) =>
      batch.reduce((sum, chunk) => sum + this.estimateTokens(chunk), 0)
    );

    return {
      totalBatches: batches.length,
      averageBatchSize: batchSizes.reduce((a, b) => a + b, 0) / batches.length,
      averageTokensPerBatch: batchTokens.reduce((a, b) => a + b, 0) / batches.length,
      largestBatch: Math.max(...batchSizes),
      smallestBatch: Math.min(...batchSizes),
    };
  }
}
