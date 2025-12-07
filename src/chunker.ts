import { Chunkyyy } from 'chunkyyy';
import { CodeChunk, ChangedFile } from './types';
import { GitService } from './git';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class ChunkService {
  private chunkyyy: Chunkyyy;
  private git: GitService;

  constructor(repoPath: string = process.cwd()) {
    this.chunkyyy = new Chunkyyy();
    this.git = new GitService(repoPath);
  }

  async chunkChangedFiles(
    changedFiles: ChangedFile[],
    branch: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    for (const file of changedFiles) {
      if (file.status === 'deleted') continue;

      try {
        const fileChunks = await this.chunkFile(file.path, branch);
        chunks.push(...fileChunks);
      } catch (error: any) {
        console.warn(`Failed to chunk ${file.path}: ${error.message}`);
      }
    }

    return chunks;
  }

  async chunkFile(filePath: string, branch?: string): Promise<CodeChunk[]> {
    const fullPath = join(process.cwd(), filePath);
    const currentBranch = await this.git.getCurrentBranch();

    // If we need content from a different branch, we'll need to handle it differently
    // For now, ensure we're on the right branch or the file exists
    let content: string;
    let actualFilePath = filePath;

    if (branch && branch !== currentBranch) {
      // Get content from the specified branch
      content = await this.git.getFileContent(filePath, branch);
      // Note: chunkyyy.chunkFile() reads from disk, so we might need to use a different approach
      // For now, we'll try to use chunkyyy's API if it supports content directly
      // Otherwise, we'll need to write to a temp file or use chunkFileByRange
      actualFilePath = filePath;
    } else {
      if (!existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      content = readFileSync(fullPath, 'utf-8');
    }

    // Use chunkyyy to chunk the file
    // Note: chunkyyy.chunkFile() may read from disk, so ensure file exists
    // If branch is different, we might need to checkout first or use a different method
    const chunks = await this.chunkyyy.chunkFile(actualFilePath);

    // Map chunkyyy chunks to our CodeChunk format
    return chunks.map((chunk: any) => {
      const startLine = chunk.startLine || chunk.range?.start?.line || 1;
      const endLine = chunk.endLine || chunk.range?.end?.line || 1;

      return {
        id: chunk.id || `${filePath}:${startLine}-${endLine}`,
        name: chunk.name || 'unnamed',
        type: chunk.type || 'unknown',
        file: filePath,
        startLine,
        endLine,
        content: this.extractContentRange(content, startLine, endLine),
        hash: chunk.hash,
        dependencies: chunk.dependencies,
      };
    });
  }

  async chunkFileByRange(
    filePath: string,
    startLine: number,
    endLine: number,
    branch?: string
  ): Promise<CodeChunk> {
    const fullPath = join(process.cwd(), filePath);

    let content: string;
    if (branch && branch !== await this.git.getCurrentBranch()) {
      content = await this.git.getFileContent(filePath, branch);
    } else {
      if (!existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      content = readFileSync(fullPath, 'utf-8');
    }

    const lines = content.split('\n');
    const chunkContent = lines.slice(startLine - 1, endLine).join('\n');

    return {
      id: `${filePath}:${startLine}-${endLine}`,
      name: `Range ${startLine}-${endLine}`,
      type: 'range',
      file: filePath,
      startLine,
      endLine,
      content: chunkContent,
    };
  }

  private extractContentRange(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }
}
