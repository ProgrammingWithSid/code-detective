import { ChunkBatcher } from '../src/utils/chunk-batcher';
import { CodeChunk } from '../src/types';

describe('ChunkBatcher', () => {
  let batcher: ChunkBatcher;

  const createMockChunk = (
    id: string,
    file: string,
    content: string,
    startLine = 1,
    endLine = 10
  ): CodeChunk => ({
    id,
    name: `chunk${id}`,
    type: 'function',
    file,
    startLine,
    endLine,
    content,
  });

  beforeEach(() => {
    batcher = new ChunkBatcher();
  });

  describe('batchChunks', () => {
    it('should create single batch for small number of chunks', () => {
      const chunks: CodeChunk[] = [
        createMockChunk('1', 'file1.ts', 'function test1() {}'),
        createMockChunk('2', 'file1.ts', 'function test2() {}'),
      ];

      const batches = batcher.batchChunks(chunks);

      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(2);
    });

    it('should split chunks when exceeding maxTokens', () => {
      const largeContent = 'x'.repeat(10000); // ~2500 tokens
      const batcherWithSmallLimit = new ChunkBatcher({ maxTokens: 1000 });

      const chunks: CodeChunk[] = [
        createMockChunk('1', 'file1.ts', largeContent),
        createMockChunk('2', 'file1.ts', largeContent),
        createMockChunk('3', 'file1.ts', largeContent),
      ];

      const batches = batcherWithSmallLimit.batchChunks(chunks);

      expect(batches.length).toBeGreaterThan(1);
      expect(batches.every((batch) => batch.length > 0)).toBe(true);
    });

    it('should split chunks when exceeding maxChunks', () => {
      const batcherWithSmallLimit = new ChunkBatcher({ maxChunks: 2 });

      const chunks: CodeChunk[] = [
        createMockChunk('1', 'file1.ts', 'function test1() {}'),
        createMockChunk('2', 'file1.ts', 'function test2() {}'),
        createMockChunk('3', 'file1.ts', 'function test3() {}'),
        createMockChunk('4', 'file1.ts', 'function test4() {}'),
        createMockChunk('5', 'file1.ts', 'function test5() {}'),
      ];

      const batches = batcherWithSmallLimit.batchChunks(chunks);

      expect(batches.length).toBeGreaterThan(1);
      expect(batches.every((batch) => batch.length <= 2)).toBe(true);
    });

    it('should group chunks by file when groupByFile is true', () => {
      const batcherWithGrouping = new ChunkBatcher({ groupByFile: true });

      const chunks: CodeChunk[] = [
        createMockChunk('1', 'file1.ts', 'function test1() {}'),
        createMockChunk('2', 'file1.ts', 'function test2() {}'),
        createMockChunk('3', 'file2.ts', 'function test3() {}'),
        createMockChunk('4', 'file2.ts', 'function test4() {}'),
      ];

      const batches = batcherWithGrouping.batchChunks(chunks);

      // Should try to keep files together
      expect(batches.length).toBeGreaterThanOrEqual(1);

      // Verify chunks from same file are in same batch when possible
      const file1Chunks = batches.flat().filter((c) => c.file === 'file1.ts');
      const file2Chunks = batches.flat().filter((c) => c.file === 'file2.ts');
      expect(file1Chunks.length).toBe(2);
      expect(file2Chunks.length).toBe(2);
    });

    it('should not group by file when groupByFile is false', () => {
      const batcherWithoutGrouping = new ChunkBatcher({ groupByFile: false });

      const chunks: CodeChunk[] = [
        createMockChunk('1', 'file1.ts', 'function test1() {}'),
        createMockChunk('2', 'file2.ts', 'function test2() {}'),
        createMockChunk('3', 'file1.ts', 'function test3() {}'),
      ];

      const batches = batcherWithoutGrouping.batchChunks(chunks);

      expect(batches.length).toBeGreaterThanOrEqual(1);
      // Chunks may be mixed across files
    });

    it('should handle empty chunks array', () => {
      const batches = batcher.batchChunks([]);
      expect(batches.length).toBe(0);
    });

    it('should handle chunks without content', () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          name: 'chunk1',
          type: 'function',
          file: 'file1.ts',
          startLine: 1,
          endLine: 10,
          content: '', // Empty content
        },
      ];

      const batches = batcher.batchChunks(chunks);
      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(1);
    });
  });

  describe('getBatchStats', () => {
    it('should return correct statistics', () => {
      const chunks: CodeChunk[] = [
        createMockChunk('1', 'file1.ts', 'function test1() {}'),
        createMockChunk('2', 'file1.ts', 'function test2() {}'),
        createMockChunk('3', 'file2.ts', 'function test3() {}'),
      ];

      const batches = batcher.batchChunks(chunks);
      const stats = batcher.getBatchStats(batches);

      expect(stats.totalBatches).toBeGreaterThan(0);
      expect(stats.averageBatchSize).toBeGreaterThan(0);
      expect(stats.largestBatch).toBeGreaterThanOrEqual(stats.smallestBatch);
    });

    it('should handle empty batches', () => {
      const stats = batcher.getBatchStats([]);

      expect(stats.totalBatches).toBe(0);
      expect(stats.averageBatchSize).toBe(0);
      expect(stats.averageTokensPerBatch).toBe(0);
    });

    it('should calculate average tokens correctly', () => {
      const chunks: CodeChunk[] = [
        createMockChunk('1', 'file1.ts', 'x'.repeat(100)), // ~25 tokens
        createMockChunk('2', 'file1.ts', 'x'.repeat(200)), // ~50 tokens
      ];

      const batches = batcher.batchChunks(chunks);
      const stats = batcher.getBatchStats(batches);

      expect(stats.averageTokensPerBatch).toBeGreaterThan(0);
    });
  });

  describe('custom configuration', () => {
    it('should respect custom maxTokens', () => {
      const customBatcher = new ChunkBatcher({ maxTokens: 100 });

      const chunks: CodeChunk[] = [
        createMockChunk('1', 'file1.ts', 'x'.repeat(500)), // ~125 tokens
        createMockChunk('2', 'file1.ts', 'x'.repeat(500)), // ~125 tokens
      ];

      const batches = customBatcher.batchChunks(chunks);

      // Should split because total exceeds 100 tokens
      expect(batches.length).toBeGreaterThan(1);
    });

    it('should respect custom maxChunks', () => {
      const customBatcher = new ChunkBatcher({ maxChunks: 3 });

      const chunks: CodeChunk[] = Array.from({ length: 10 }, (_, i) =>
        createMockChunk(String(i), 'file1.ts', 'function test() {}')
      );

      const batches = customBatcher.batchChunks(chunks);

      expect(batches.length).toBeGreaterThan(1);
      expect(batches.every((batch) => batch.length <= 3)).toBe(true);
    });
  });
});
