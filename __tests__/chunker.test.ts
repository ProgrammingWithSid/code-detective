import { ChunkService } from '../src/chunker';
import { Chunkyyy } from 'chunkyyy';
import { GitService } from '../src/git';
import { ChangedFile } from '../src/types';
import * as fs from 'fs';

jest.mock('chunkyyy');
jest.mock('../src/git');
jest.mock('fs');

describe('ChunkService', () => {
  let chunkService: ChunkService;
  let mockChunkyyy: jest.Mocked<Chunkyyy>;
  let mockGitService: jest.Mocked<GitService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChunkyyy = {
      chunkFile: jest.fn(),
    } as any;

    mockGitService = {
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      getFileContent: jest.fn(),
    } as any;

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

      const mockChunks1 = [
        {
          id: 'chunk1',
          name: 'function1',
          type: 'function',
          startLine: 1,
          endLine: 10,
          hash: 'hash1',
        },
      ];

      const mockChunks2 = [
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
        .mockResolvedValueOnce(mockChunks1 as any)
        .mockResolvedValueOnce(mockChunks2 as any);

      // Mock file content reading
      jest.spyOn(fs, 'readFileSync').mockReturnValue('line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20\nline21\nline22\nline23\nline24\nline25\nline26\nline27\nline28\nline29\nline30');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
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

      const mockChunks = [
        {
          id: 'chunk1',
          name: 'function1',
          type: 'function',
          startLine: 1,
          endLine: 10,
        },
      ];

      mockChunkyyy.chunkFile.mockResolvedValueOnce(mockChunks as any);

      jest.spyOn(fs, 'readFileSync').mockReturnValue('line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      mockGitService.getCurrentBranch.mockResolvedValue('feature-branch');

      const chunks = await chunkService.chunkChangedFiles(changedFiles, 'feature-branch');

      expect(chunks).toHaveLength(1);
      expect(mockChunkyyy.chunkFile).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      const changedFiles: ChangedFile[] = [
        { path: 'src/file1.ts', status: 'modified' },
        { path: 'src/file2.ts', status: 'added' },
      ];

      mockChunkyyy.chunkFile
        .mockResolvedValueOnce([{ id: 'chunk1', startLine: 1, endLine: 10 }] as any)
        .mockRejectedValueOnce(new Error('Failed to parse'));

      jest.spyOn(fs, 'readFileSync').mockReturnValue('line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      mockGitService.getCurrentBranch.mockResolvedValue('feature-branch');

      const chunks = await chunkService.chunkChangedFiles(changedFiles, 'feature-branch');

      expect(chunks).toHaveLength(1);
    });
  });

  describe('chunkFile', () => {
    it('should chunk a file and map to CodeChunk format', async () => {
      const mockChunks = [
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

      mockChunkyyy.chunkFile.mockResolvedValue(mockChunks as any);

      const { readFileSync, existsSync } = require('fs');
      const fileContent = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15';
      jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(fileContent);
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);

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
      const mockChunks = [
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

      mockChunkyyy.chunkFile.mockResolvedValue(mockChunks as any);

      jest.spyOn(fs, 'readFileSync').mockReturnValue('file content');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      const chunks = await chunkService.chunkFile('src/file.ts');

      expect(chunks[0].startLine).toBe(10);
      expect(chunks[0].endLine).toBe(20);
    });

    it('should use git content when branch is different', async () => {
      mockGitService.getCurrentBranch.mockResolvedValue('main');
      mockGitService.getFileContent.mockResolvedValue('git file content');

      const mockChunks = [
        {
          id: 'chunk1',
          name: 'myFunction',
          type: 'function',
          startLine: 1,
          endLine: 10,
        },
      ];

      mockChunkyyy.chunkFile.mockResolvedValue(mockChunks as any);

      const chunks = await chunkService.chunkFile('src/file.ts', 'feature-branch');

      expect(mockGitService.getFileContent).toHaveBeenCalledWith('src/file.ts', 'feature-branch');
    });
  });

  describe('chunkFileByRange', () => {
    it('should create a chunk for a specific line range', async () => {
      const { readFileSync, existsSync } = require('fs');
      const fileContent = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';
      jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(fileContent);
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);

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
  });
});
