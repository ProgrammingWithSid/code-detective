import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { z } from 'zod';
import {
  CodeIndexer,
  DependencyExtraction,
  DependencyExtractionSchema,
  SymbolExtraction,
  SymbolExtractionSchema,
} from '../types';

/**
 * Implementation of CodeIndexer that connects to a Rust-based indexer service
 */
export class IndexerClient implements CodeIndexer {
  private baseUrl: string;
  private timeout: number;
  private client: AxiosInstance;

  constructor(baseUrl: string = 'http://localhost:8080', timeout: number = 30000) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.timeout = timeout;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
    });
  }

  /**
   * Check if the indexer service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract symbols from a file using the Rust indexer
   */
  async extractSymbols(repoPath: string, filePath: string): Promise<SymbolExtraction[]> {
    try {
      const response: AxiosResponse<unknown> = await this.client.get(
        `/extract/${encodeURIComponent(repoPath)}/${filePath}`
      );
      return z.array(SymbolExtractionSchema).parse(response.data);
    } catch (error) {
      console.warn(`Indexer failed to extract symbols for ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Extract dependencies from a file using the Rust indexer
   */
  async extractDeps(repoPath: string, filePath: string): Promise<DependencyExtraction[]> {
    try {
      const response: AxiosResponse<unknown> = await this.client.get(
        `/extract-deps/${encodeURIComponent(repoPath)}/${filePath}`
      );
      return z.array(DependencyExtractionSchema).parse(response.data);
    } catch (error) {
      console.warn(`Indexer failed to extract dependencies for ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Get hash for a file chunk
   */
  async getHash(repoPath: string, filePath: string): Promise<string | null> {
    try {
      const response: AxiosResponse<unknown> = await this.client.get(
        `/hash/${encodeURIComponent(repoPath)}/${filePath}`
      );
      const schema = z.object({ hash: z.string() });
      const parsed = schema.parse(response.data);
      return parsed.hash;
    } catch (error) {
      return null;
    }
  }
}

/**
 * Factory function to create an IndexerClient
 */
export function createIndexerClient(baseUrl?: string, timeout?: number): IndexerClient {
  return new IndexerClient(baseUrl, timeout);
}
