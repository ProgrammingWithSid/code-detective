import { Chunkyyy } from 'chunkyyy';
import * as fs from 'fs';
import { ChunkService } from '../src/chunker';
import { GitService } from '../src/git';
import { ChangedFile, ChunkyyyChunk, CodeSherlockError } from '../src/types';

jest.mock('chunkyyy');
jest.mock('../src/git');
jest.mock('fs');

describe('ChunkService', () => {
  let chunkService: ChunkService;
  let mockChunkyyy: jest.Mocked<Chunkyyy>;
  let mockGitService: jest.Mocked<GitService>;

  const createFileContent = (lines: number): string => {
    return Array.from({ length: lines }, (_, i) => `line${i + 1}`).join('\n');
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockChunkyyy = {
      chunkFile: jest.fn(),
    } as unknown as jest.Mocked<Chunkyyy>;

    mockGitService = {
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      getFileContent: jest.fn(),
    } as unknown as jest.Mocked<GitService>;

    (Chunkyyy as jest.MockedClass<typeof Chunkyyy>).mockImplementation(() => mockChunkyyy);
    (GitService as jest.MockedClass<typeof GitService>).mockImplementation(() => mockGitService);

    chunkService = new ChunkService('/test/repo');
  });

  describe('chunkChangedFiles', () => {
    it('should chunk all changed files', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/file1.ts', status: 'modified' },
        { path: 'src/file2.ts', status: 'added' },
      ];

      const mockChunks1: ChunkyyyChunk[] = [
        {
          id: 'chunk1',
          name: 'function1',
          type: 'function',
          startLine: 1,
          endLine: 10,
          hash: 'hash1',
        },
      ];

      const mockChunks2: ChunkyyyChunk[] = [
        {
          id: 'chunk2',
          name: 'class1',
          type: 'class',
          startLine: 15,
          endLine: 30,
          hash: 'hash2',
        },
      ];

      mockChunkyyy.chunkFile
        .mockResolvedValueOnce(mockChunks1 as never)
        .mockResolvedValueOnce(mockChunks2 as never);

      (fs.readFileSync as jest.Mock).mockReturnValue(createFileContent(30));
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockGitService.getCurrentBranch.mockResolvedValue('feature-branch');

      const chunks = await chunkService.chunkChangedFiles(changedFiles, 'feature-branch');

      expect(chunks).toHaveLength(2);
      expect(chunks[0].file).toBe('src/file1.ts');
      expect(chunks[1].file).toBe('src/file2.ts');
    });

    it('should skip deleted files', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/file1.ts', status: 'modified' },
        { path: 'src/file2.ts', status: 'deleted' },
      ];

      const mockChunks: ChunkyyyChunk[] = [
        {
          id: 'chunk1',
          name: 'function1',
          type: 'function',
          startLine: 1,
          endLine: 10,
        },
      ];

      mockChunkyyy.chunkFile.mockResolvedValueOnce(mockChunks as never);

      (fs.readFileSync as jest.Mock).mockReturnValue(createFileContent(10));
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockGitService.getCurrentBranch.mockResolvedValue('feature-branch');

      const chunks = await chunkService.chunkChangedFiles(changedFiles, 'feature-branch');

      expect(chunks).toHaveLength(1);
      expect(mockChunkyyy.chunkFile).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully with fallback chunking', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/file1.ts', status: 'modified' },
        { path: 'src/file2.ts', status: 'added' },
      ];

      mockChunkyyy.chunkFile
        .mockResolvedValueOnce([{ id: 'chunk1', startLine: 1, endLine: 10 }] as never)
        .mockRejectedValueOnce(new Error('Failed to parse'));

      (fs.readFileSync as jest.Mock).mockReturnValue(createFileContent(10));
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      mockGitService.getCurrentBranch.mockResolvedValue('feature-branch');

      const chunks = await chunkService.chunkChangedFiles(changedFiles, 'feature-branch');

      // Both files should have chunks - file2 uses fallback chunking when chunkyyy fails
      expect(chunks).toHaveLength(2);
      expect(chunks[0].file).toBe('src/file1.ts');
      expect(chunks[1].file).toBe('src/file2.ts');
      expect(chunks[1].type).toBe('typescript'); // Fallback type for .ts files
    });
  });

  describe('chunkFile', () => {
    it('should chunk a file and map to CodeChunk format', async () => {
      const mockChunks: ChunkyyyChunk[] = [
        {
          id: 'chunk1',
          name: 'myFunction',
          type: 'function',
          startLine: 5,
          endLine: 15,
          hash: 'abc123',
          dependencies: ['dep1', 'dep2'],
        },
      ];

      mockChunkyyy.chunkFile.mockResolvedValue(mockChunks as never);

      const fileContent = createFileContent(15);
      (fs.readFileSync as jest.Mock).mockReturnValue(fileContent);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const chunks = await chunkService.chunkFile('src/file.ts');

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        id: 'chunk1',
        name: 'myFunction',
        type: 'function',
        file: 'src/file.ts',
        startLine: 5,
        endLine: 15,
        hash: 'abc123',
        dependencies: ['dep1', 'dep2'],
      });
    });

    it('should handle chunks with range object', async () => {
      const mockChunks: ChunkyyyChunk[] = [
        {
          id: 'chunk1',
          name: 'myFunction',
          type: 'function',
          range: {
            start: { line: 10 },
            end: { line: 20 },
          },
        },
      ];

      mockChunkyyy.chunkFile.mockResolvedValue(mockChunks as never);

      (fs.readFileSync as jest.Mock).mockReturnValue('file content');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const chunks = await chunkService.chunkFile('src/file.ts');

      expect(chunks[0].startLine).toBe(10);
      expect(chunks[0].endLine).toBe(20);
    });

    it('should use git content when branch is different', async () => {
      mockGitService.getCurrentBranch.mockResolvedValue('main');
      mockGitService.getFileContent.mockResolvedValue('git file content');

      const mockChunks: ChunkyyyChunk[] = [
        {
          id: 'chunk1',
          name: 'myFunction',
          type: 'function',
          startLine: 1,
          endLine: 10,
        },
      ];

      mockChunkyyy.chunkFile.mockResolvedValue(mockChunks as never);

      await chunkService.chunkFile('src/file.ts', 'feature-branch');

      expect(mockGitService.getFileContent).toHaveBeenCalledWith('src/file.ts', 'feature-branch');
    });

    it('should use fallback chunking when chunkyyy returns empty', async () => {
      mockChunkyyy.chunkFile.mockResolvedValue([] as never);

      const fileContent = createFileContent(50);
      (fs.readFileSync as jest.Mock).mockReturnValue(fileContent);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const chunks = await chunkService.chunkFile('src/component.vue');

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('vue-component');
      expect(chunks[0].startLine).toBe(1);
      expect(chunks[0].endLine).toBe(50);
    });

    it('should throw error if file not found', async () => {
      mockGitService.getCurrentBranch.mockResolvedValue('main');
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(chunkService.chunkFile('nonexistent.ts')).rejects.toThrow(CodeSherlockError);
    });

    it('should detect correct file types', async () => {
      mockChunkyyy.chunkFile.mockResolvedValue([] as never);
      (fs.readFileSync as jest.Mock).mockReturnValue('content');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const testCases = [
        { file: 'test.tsx', expectedType: 'react-component' },
        { file: 'test.vue', expectedType: 'vue-component' },
        { file: 'test.svelte', expectedType: 'svelte-component' },
        { file: 'test.ts', expectedType: 'typescript' },
        { file: 'test.py', expectedType: 'python' },
        { file: 'test.go', expectedType: 'go' },
        { file: 'test.unknown', expectedType: 'file' },
      ];

      for (const testCase of testCases) {
        const chunks = await chunkService.chunkFile(testCase.file);
        expect(chunks[0].type).toBe(testCase.expectedType);
      }
    });
  });

  describe('chunkFileByRange', () => {
    it('should create a chunk for a specific line range', async () => {
      const fileContent = createFileContent(10);
      (fs.readFileSync as jest.Mock).mockReturnValue(fileContent);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const chunk = await chunkService.chunkFileByRange('src/file.ts', 3, 7);

      expect(chunk).toMatchObject({
        file: 'src/file.ts',
        startLine: 3,
        endLine: 7,
        type: 'range',
      });
      expect(chunk.content).toBe('line3\nline4\nline5\nline6\nline7');
    });

    it('should use git content when branch is different', async () => {
      mockGitService.getCurrentBranch.mockResolvedValue('main');
      mockGitService.getFileContent.mockResolvedValue('line1\nline2\nline3\nline4\nline5');

      const chunk = await chunkService.chunkFileByRange('src/file.ts', 2, 4, 'feature-branch');

      expect(mockGitService.getFileContent).toHaveBeenCalledWith('src/file.ts', 'feature-branch');
      expect(chunk.content).toBe('line2\nline3\nline4');
    });

    it('should handle edge cases for line ranges', async () => {
      const fileContent = createFileContent(5);
      (fs.readFileSync as jest.Mock).mockReturnValue(fileContent);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // First line only
      const chunk1 = await chunkService.chunkFileByRange('src/file.ts', 1, 1);
      expect(chunk1.content).toBe('line1');

      // Last line only
      const chunk2 = await chunkService.chunkFileByRange('src/file.ts', 5, 5);
      expect(chunk2.content).toBe('line5');

      // Entire file
      const chunk3 = await chunkService.chunkFileByRange('src/file.ts', 1, 5);
      expect(chunk3.content).toBe('line1\nline2\nline3\nline4\nline5');
    });
  });
});
