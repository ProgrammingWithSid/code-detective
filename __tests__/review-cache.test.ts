import { CodeChunk, ReviewResult } from '../src/types';
import { ReviewCache } from '../src/utils/review-cache';

describe('ReviewCache', () => {
  let cache: ReviewCache;
  const mockReviewResult: ReviewResult = {
    comments: [
      {
        file: 'test.ts',
        line: 10,
        body: 'Test comment',
        severity: 'warning',
      },
    ],
    summary: 'Test summary',
    stats: {
      errors: 0,
      warnings: 1,
      suggestions: 0,
    },
  };

  beforeEach(() => {
    cache = new ReviewCache(1000, 10); // 1 second TTL, max 10 entries for testing
  });

  describe('generateCacheKey', () => {
    it('should generate consistent keys for same chunks', () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          hash: 'hash1',
        },
      ];

      const key1 = cache.generateCacheKey(chunks);
      const key2 = cache.generateCacheKey(chunks);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different chunks', () => {
      const chunks1: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test1',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test1() {}',
          hash: 'hash1',
        },
      ];

      const chunks2: CodeChunk[] = [
        {
          id: 'chunk2',
          name: 'test2',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test2() {}',
          hash: 'hash2',
        },
      ];

      const key1 = cache.generateCacheKey(chunks1);
      const key2 = cache.generateCacheKey(chunks2);

      expect(key1).not.toBe(key2);
    });

    it('should generate same key regardless of chunk order', () => {
      const chunks1: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test1',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test1() {}',
          hash: 'hash1',
        },
        {
          id: 'chunk2',
          name: 'test2',
          type: 'function',
          file: 'test.ts',
          startLine: 11,
          endLine: 20,
          content: 'function test2() {}',
          hash: 'hash2',
        },
      ];

      const chunks2 = [...chunks1].reverse();

      const key1 = cache.generateCacheKey(chunks1);
      const key2 = cache.generateCacheKey(chunks2);

      expect(key1).toBe(key2);
    });

    it('should use content hash when chunk hash is missing', () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          // No hash provided
        },
      ];

      const key = cache.generateCacheKey(chunks);
      expect(key).toBeDefined();
      expect(key.length).toBeGreaterThan(0);
    });
  });

  describe('get and set', () => {
    it('should store and retrieve cached review', () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const key = cache.generateCacheKey(chunks);
      cache.set(key, mockReviewResult);

      const retrieved = cache.get(key);
      expect(retrieved).toEqual(mockReviewResult);
    });

    it('should return null for non-existent entry', () => {
      const retrieved = cache.get('nonexistent-key');
      expect(retrieved).toBeNull();
    });

    it('should return null for expired entry', () => {
      const shortTTLCache = new ReviewCache(100, 10); // 100ms TTL
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const key = shortTTLCache.generateCacheKey(chunks);
      shortTTLCache.set(key, mockReviewResult);

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const retrieved = shortTTLCache.get(key);
          expect(retrieved).toBeNull();
          resolve();
        }, 150);
      });
    });

    it('should handle multiple cached reviews', () => {
      const chunks1: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test1',
          type: 'function',
          file: 'test1.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test1() {}',
        },
      ];

      const chunks2: CodeChunk[] = [
        {
          id: 'chunk2',
          name: 'test2',
          type: 'function',
          file: 'test2.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test2() {}',
        },
      ];

      const result1 = { ...mockReviewResult, summary: 'Review 1' };
      const result2 = { ...mockReviewResult, summary: 'Review 2' };

      const key1 = cache.generateCacheKey(chunks1);
      const key2 = cache.generateCacheKey(chunks2);

      cache.set(key1, result1);
      cache.set(key2, result2);

      expect(cache.get(key1)).toEqual(result1);
      expect(cache.get(key2)).toEqual(result2);
    });
  });

  describe('invalidate', () => {
    it('should remove specific entry from cache', () => {
      const chunks1: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test1',
          type: 'function',
          file: 'test1.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test1() {}',
        },
      ];

      const chunks2: CodeChunk[] = [
        {
          id: 'chunk2',
          name: 'test2',
          type: 'function',
          file: 'test2.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test2() {}',
        },
      ];

      const key1 = cache.generateCacheKey(chunks1);
      const key2 = cache.generateCacheKey(chunks2);

      cache.set(key1, mockReviewResult);
      cache.set(key2, mockReviewResult);

      cache.invalidate(key1);

      expect(cache.get(key1)).toBeNull();
      expect(cache.get(key2)).toEqual(mockReviewResult);
    });
  });

  describe('clear', () => {
    it('should remove all entries and reset statistics', () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const key = cache.generateCacheKey(chunks);
      cache.set(key, mockReviewResult);

      const statsBefore = cache.getStats();
      expect(statsBefore.size).toBe(1);

      cache.clear();

      const statsAfter = cache.getStats();
      expect(statsAfter.size).toBe(0);
      expect(statsAfter.hits).toBe(0);
      expect(statsAfter.misses).toBe(0);
      expect(cache.get(key)).toBeNull();
    });
  });

  describe('eviction', () => {
    it('should evict oldest entry when cache is full', async () => {
      const smallCache = new ReviewCache(1000, 3); // Max 3 entries

      const results = [];
      for (let i = 0; i < 4; i++) {
        const chunks: CodeChunk[] = [
          {
            id: `chunk${i}`,
            name: `test${i}`,
            type: 'function',
            file: `test${i}.ts`,
            startLine: 1,
            endLine: 10,
            content: `function test${i}() {}`,
          },
        ];
        const key = smallCache.generateCacheKey(chunks);
        const result = { ...mockReviewResult, summary: `Review ${i}` };
        smallCache.set(key, result);
        results.push({ key, result });

        // Small delay to ensure different timestamps
        if (i < 3) {
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
      }

      const stats = smallCache.getStats();
      expect(stats.size).toBe(3);
      expect(stats.evictions).toBeGreaterThan(0);
      // First entry should be evicted
      expect(smallCache.get(results[0].key)).toBeNull();
      // Last entry should be present
      expect(smallCache.get(results[3].key)).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should track hits and misses correctly', () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test',
          type: 'function',
          file: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
        },
      ];

      const key = cache.generateCacheKey(chunks);

      // Miss
      cache.get('nonexistent-key');
      // Miss
      cache.get(key);

      // Set and hit
      cache.set(key, mockReviewResult);
      cache.get(key);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(1 / 3, 2);
    });

    it('should return correct cache size', () => {
      expect(cache.getStats().size).toBe(0);

      const chunks1: CodeChunk[] = [
        {
          id: 'chunk1',
          name: 'test1',
          type: 'function',
          file: 'test1.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test1() {}',
        },
      ];

      const key1 = cache.generateCacheKey(chunks1);
      cache.set(key1, mockReviewResult);
      expect(cache.getStats().size).toBe(1);

      const chunks2: CodeChunk[] = [
        {
          id: 'chunk2',
          name: 'test2',
          type: 'function',
          file: 'test2.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test2() {}',
        },
      ];

      const key2 = cache.generateCacheKey(chunks2);
      cache.set(key2, mockReviewResult);
      expect(cache.getStats().size).toBe(2);
    });

    it('should return max size', () => {
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(10);
    });
  });
});
