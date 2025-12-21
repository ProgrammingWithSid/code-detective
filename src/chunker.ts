import { Chunkyyy } from 'chunkyyy';
import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { GitService } from './git';
import { ChangedFile, ChunkyyyChunk, CodeChunk, CodeSherlockError, FileLanguageMap } from './types';

// ============================================================================
// Constants
// ============================================================================

const FILE_TYPE_MAP: FileLanguageMap = {
  vue: 'vue-component',
  svelte: 'svelte-component',
  tsx: 'react-component',
  jsx: 'react-component',
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  css: 'stylesheet',
  scss: 'stylesheet',
  less: 'stylesheet',
  html: 'html',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
};

/**
 * Language detection map (aligned with chunkyyy's language detection)
 */
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.vue': 'vue',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.kt': 'kotlin',
  '.swift': 'swift',
};

// ============================================================================
// ChunkService
// ============================================================================

export class ChunkService {
  private chunkyyy: Chunkyyy;
  private git: GitService;
  private basePath: string;

  constructor(repoPath: string = process.cwd()) {
    this.basePath = repoPath;
    this.chunkyyy = new Chunkyyy();
    this.git = new GitService(repoPath);
  }

  /**
   * Chunk all changed files
   * @param changedFiles - Array of changed files
   * @param branch - Branch name to read files from
   */
  async chunkChangedFiles(changedFiles: ChangedFile[], branch: string): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    // Documentation file patterns to exclude from review
    const docFilePatterns = [
      /\.md$/i,
      /\.mdx$/i,
      /\.txt$/i,
      /^README/i,
      /^CHANGELOG/i,
      /^LICENSE/i,
      /^CONTRIBUTING/i,
      /^\.gitignore$/i,
      /^\.gitattributes$/i,
      /docs\//i,
      /^\.github\//i,
      /^\.vscode\//i,
      /^\.idea\//i,
    ];

    for (const file of changedFiles) {
      if (file.status === 'deleted') continue;

      // Skip documentation and config files
      if (docFilePatterns.some((pattern) => pattern.test(file.path))) {
        continue;
      }

      try {
        const fileChunks = await this.chunkFile(file.path, branch);
        chunks.push(...fileChunks);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to chunk ${file.path}: ${errorMessage}`);
      }
    }

    return chunks;
  }

  /**
   * Chunk a single file
   * @param filePath - Path to the file relative to repo root
   * @param branch - Optional branch name to read file from
   */
  async chunkFile(filePath: string, branch?: string): Promise<CodeChunk[]> {
    const fullPath = join(this.basePath, filePath);
    const currentBranch = await this.git.getCurrentBranch();

    const content = await this.getFileContent(filePath, fullPath, branch, currentBranch);
    const rawChunks = await this.getRawChunks(filePath);

    if (!rawChunks || rawChunks.length === 0) {
      return this.createFallbackChunk(filePath, content);
    }

    return this.mapChunksToCodeChunks(rawChunks, filePath, content);
  }

  /**
   * Create a chunk for a specific line range
   * @param filePath - Path to the file
   * @param startLine - Start line number (1-indexed)
   * @param endLine - End line number (1-indexed)
   * @param branch - Optional branch name
   */
  async chunkFileByRange(
    filePath: string,
    startLine: number,
    endLine: number,
    branch?: string
  ): Promise<CodeChunk> {
    const fullPath = join(this.basePath, filePath);
    const currentBranch = await this.git.getCurrentBranch();

    const content = await this.getFileContent(filePath, fullPath, branch, currentBranch);
    const lines = content.split('\n');
    const chunkContent = lines.slice(startLine - 1, endLine).join('\n');

    // Extract extension and language from file path (aligned with chunkyyy)
    const extension = extname(filePath).toLowerCase();
    const language = LANGUAGE_MAP[extension] || 'typescript';

    return {
      id: `${filePath}:${startLine}-${endLine}`,
      name: `Range ${startLine}-${endLine}`,
      type: 'range',
      file: filePath,
      startLine,
      endLine,
      content: chunkContent,
      extension,
      language,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async getFileContent(
    filePath: string,
    fullPath: string,
    branch: string | undefined,
    currentBranch: string
  ): Promise<string> {
    if (branch && branch !== currentBranch) {
      return await this.git.getFileContent(filePath, branch);
    }

    if (!existsSync(fullPath)) {
      throw new CodeSherlockError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    }

    return readFileSync(fullPath, 'utf-8');
  }

  private async getRawChunks(filePath: string): Promise<ChunkyyyChunk[]> {
    try {
      const chunks = await this.chunkyyy.chunkFile(filePath);
      return chunks as unknown as ChunkyyyChunk[];
    } catch {
      console.warn(`chunkyyy could not parse ${filePath}, using fallback chunking`);
      return [];
    }
  }

  private createFallbackChunk(filePath: string, content: string): CodeChunk[] {
    const lines = content.split('\n');
    console.log(`Using fallback chunking for ${filePath} (${lines.length} lines)`);

    // Extract extension and language from file path (aligned with chunkyyy)
    const extension = extname(filePath).toLowerCase();
    const language = LANGUAGE_MAP[extension] || 'typescript';

    return [
      {
        id: `${filePath}:1-${lines.length}`,
        name: this.getFileName(filePath),
        type: this.getFileType(filePath),
        file: filePath,
        startLine: 1,
        endLine: lines.length,
        content: content,
        extension,
        language,
      },
    ];
  }

  private mapChunksToCodeChunks(
    chunks: ChunkyyyChunk[],
    filePath: string,
    content: string
  ): CodeChunk[] {
    return chunks.map((chunk) => {
      const startLine = chunk.startLine ?? chunk.range?.start?.line ?? 1;
      const endLine = chunk.endLine ?? chunk.range?.end?.line ?? 1;

      // Use filePath from chunk if available (from chunkyyy), otherwise use parameter
      const chunkFilePath = chunk.filePath || filePath;

      // Extract extension and language from file path (using chunkyyy's filePath when available)
      const extension = extname(chunkFilePath).toLowerCase();
      const language = LANGUAGE_MAP[extension] || 'typescript';

      // Map dependencies to string array (handle various formats from chunkyyy)
      const dependencies = chunk.dependencies?.map((dep) => {
        if (typeof dep === 'string') return dep;
        if (typeof dep === 'object' && dep !== null && 'name' in dep) {
          return String((dep as { name: string }).name);
        }
        return String(dep);
      });

      return {
        id: chunk.id ?? `${chunkFilePath}:${startLine}-${endLine}`,
        name: chunk.name ?? 'unnamed',
        type: chunk.type ?? 'unknown',
        file: chunkFilePath,
        startLine,
        endLine,
        content: this.extractContentRange(content, startLine, endLine),
        hash: chunk.hash,
        dependencies,
        extension,
        language,
      };
    });
  }

  private getFileName(filePath: string): string {
    return filePath.split('/').pop() ?? filePath;
  }

  private getFileType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    return FILE_TYPE_MAP[ext] ?? 'file';
  }

  private extractContentRange(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }
}
