// Mock for chunkyyy library
export class Chunkyyy {
  chunkFile(_filePath: string): Promise<ChunkResult[]> {
    return Promise.resolve([]);
  }
}

export interface ChunkResult {
  id?: string;
  name?: string;
  type?: string;
  startLine?: number;
  endLine?: number;
  hash?: string;
  dependencies?: unknown[];
  range?: {
    start?: { line?: number };
    end?: { line?: number };
  };
}

export default { Chunkyyy };
