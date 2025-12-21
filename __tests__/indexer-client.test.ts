import axios from 'axios';
import { IndexerClient } from '../src/utils/indexer-client';

jest.mock('axios');

describe('IndexerClient', () => {
  let client: IndexerClient;
  const baseUrl = 'http://test-indexer:8080';
  let mockInstance: {
    get: jest.Mock;
    post: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock axios instance
    mockInstance = {
      get: jest.fn(),
      post: jest.fn(),
      create: jest.fn().mockReturnThis(),
    };

    (axios.create as jest.Mock).mockReturnValue(mockInstance);
    client = new IndexerClient(baseUrl);
  });

  describe('isAvailable', () => {
    it('should return true if health check succeeds', async () => {
      mockInstance.get.mockResolvedValueOnce({ status: 200 });
      const result = await client.isAvailable();
      expect(result).toBe(true);
      expect(mockInstance.get).toHaveBeenCalledWith('/health');
    });

    it('should return false if health check fails', async () => {
      mockInstance.get.mockRejectedValueOnce(new Error('Conn refused'));
      const result = await client.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('extractSymbols', () => {
    it('should parse and return symbols on success', async () => {
      const mockData = [
        {
          name: 'func1',
          type: 'function',
          signature: '() => void',
          start_line: 1,
          end_line: 10,
          is_exported: true,
        },
      ];
      mockInstance.get.mockResolvedValueOnce({ data: mockData });

      const repoPath = '/abs/repo';
      const filePath = 'src/test.ts';
      const result = await client.extractSymbols(repoPath, filePath);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('func1');
      expect(mockInstance.get).toHaveBeenCalledWith(
        `/extract/${encodeURIComponent(repoPath)}/${filePath}`
      );
    });

    it('should return empty array and warn on error', async () => {
      mockInstance.get.mockRejectedValueOnce(new Error('Fail'));
      const result = await client.extractSymbols('repo', 'file');
      expect(result).toEqual([]);
    });
  });

  describe('extractDeps', () => {
    it('should parse and return dependencies on success', async () => {
      const mockData = [{ source: 'a.ts', target: 'b.ts', type: 'import' }];
      mockInstance.get.mockResolvedValueOnce({ data: mockData });

      const result = await client.extractDeps('repo', 'file');

      expect(result).toHaveLength(1);
      expect(result[0].target).toBe('b.ts');
    });
  });

  describe('getHash', () => {
    it('should return hash on success', async () => {
      mockInstance.get.mockResolvedValueOnce({ data: { hash: 'abc-123' } });
      const result = await client.getHash('repo', 'file');
      expect(result).toBe('abc-123');
    });

    it('should return null on failure', async () => {
      mockInstance.get.mockRejectedValueOnce(new Error('Fail'));
      const result = await client.getHash('repo', 'file');
      expect(result).toBeNull();
    });
  });
});
