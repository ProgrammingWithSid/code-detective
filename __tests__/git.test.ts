import * as fs from 'fs';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { GitService } from '../src/git';
import { GitError } from '../src/types';

jest.mock('simple-git');
jest.mock('fs');
jest.mock('path');

describe('GitService', () => {
  let gitService: GitService;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGit = {
      checkout: jest.fn().mockResolvedValue(undefined),
      fetch: jest.fn().mockResolvedValue(undefined),
      show: jest.fn(),
      revparse: jest.fn(),
      raw: jest.fn(),
    } as unknown as jest.Mocked<SimpleGit>;

    (simpleGit as jest.MockedFunction<typeof simpleGit>).mockReturnValue(
      mockGit as unknown as SimpleGit
    );
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
    (path.join as jest.MockedFunction<typeof path.join>).mockReturnValue('/test/repo/.git');

    gitService = new GitService('/test/repo');
  });

  describe('constructor', () => {
    it('should throw GitError if not a git repository', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      expect(() => new GitService('/not-a-repo')).toThrow(GitError);
    });
  });

  describe('checkoutBranch', () => {
    it('should checkout a branch successfully', async () => {
      mockGit.checkout.mockResolvedValue('' as never);

      await gitService.checkoutBranch('feature-branch');

      expect(mockGit.checkout).toHaveBeenCalledWith('feature-branch');
    });

    it('should fetch and checkout remote branch if local branch does not exist', async () => {
      mockGit.checkout.mockRejectedValueOnce(new Error('did not match any file'));
      mockGit.checkout.mockResolvedValueOnce('' as never);

      await gitService.checkoutBranch('remote-branch');

      expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'remote-branch');
      expect(mockGit.checkout).toHaveBeenCalledWith('origin/remote-branch');
    });

    it('should throw GitError if checkout fails for other reasons', async () => {
      mockGit.checkout.mockRejectedValue(new Error('Permission denied'));

      await expect(gitService.checkoutBranch('feature-branch')).rejects.toThrow(GitError);
    });
  });

  describe('getChangedFiles', () => {
    it('should return changed files with correct status', async () => {
      // Mock for detectBaseBranch - first candidate succeeds
      mockGit.raw
        .mockResolvedValueOnce('abc123') // merge-base for origin/main (detectBaseBranch)
        .mockResolvedValueOnce('abc123') // merge-base for actual comparison
        .mockResolvedValueOnce('commit1\ncommit2\ncommit3') // log
        .mockResolvedValueOnce('10\t0\tsrc/file1.ts\n0\t5\tsrc/file2.ts\n5\t3\tsrc/file3.ts') // numstat
        .mockResolvedValueOnce('@@ -1,1 +1,11 @@\n+new content') // file1 diff
        .mockResolvedValueOnce('@@ -1,5 +1,0 @@\n-old content') // file2 diff
        .mockResolvedValueOnce('@@ -1,3 +1,5 @@\n+modified content'); // file3 diff

      const changedFiles = await gitService.getChangedFiles('feature-branch');

      expect(changedFiles).toHaveLength(3);
      expect(changedFiles[0]).toMatchObject({
        path: 'src/file1.ts',
        status: 'added',
        additions: 10,
        deletions: 0,
      });
      expect(changedFiles[1]).toMatchObject({
        path: 'src/file2.ts',
        status: 'deleted',
        additions: 0,
        deletions: 5,
      });
      expect(changedFiles[2]).toMatchObject({
        path: 'src/file3.ts',
        status: 'modified',
        additions: 5,
        deletions: 3,
      });
    });

    it('should exclude binary files', async () => {
      mockGit.raw
        .mockResolvedValueOnce('abc123') // merge-base for origin/main (detectBaseBranch)
        .mockResolvedValueOnce('abc123') // merge-base for actual comparison
        .mockResolvedValueOnce('commit1') // log
        .mockResolvedValueOnce('10\t0\tsrc/file.ts\n-\t-\timage.png') // numstat
        .mockResolvedValueOnce('@@ -1,1 +1,11 @@\n+new content'); // file diff

      const changedFiles = await gitService.getChangedFiles('feature-branch');

      expect(changedFiles).toHaveLength(1);
      expect(changedFiles[0].path).toBe('src/file.ts');
    });

    it('should return empty array when no commits found', async () => {
      mockGit.raw.mockResolvedValueOnce('abc123').mockResolvedValueOnce('');

      const changedFiles = await gitService.getChangedFiles('feature-branch');

      expect(changedFiles).toHaveLength(0);
    });

    it('should use provided base branch', async () => {
      mockGit.raw
        .mockResolvedValueOnce('abc123')
        .mockResolvedValueOnce('commit1')
        .mockResolvedValueOnce('5\t2\tsrc/file.ts')
        .mockResolvedValueOnce('@@ -1,2 +1,5 @@\n+new');

      await gitService.getChangedFiles('feature-branch', 'develop');

      expect(mockGit.raw).toHaveBeenCalledWith(['merge-base', 'develop', 'feature-branch']);
    });
  });

  describe('getChangedLines', () => {
    it('should parse diff and extract changed line numbers', async () => {
      const diff = `diff --git a/src/file.ts b/src/file.ts
index 1234567..abcdefg 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -10,5 +10,7 @@ function test() {
   const a = 1;
   const b = 2;
+  const c = 3;
+  const d = 4;
   const e = 5;
   return a + b;
 }
`;

      mockGit.raw.mockResolvedValue(diff);

      const changedLines = await gitService.getChangedLines(
        'src/file.ts',
        'abc123',
        'feature-branch'
      );

      expect(changedLines).toBeInstanceOf(Set);
      expect(changedLines.size).toBe(2);
      expect(Array.from(changedLines).sort()).toEqual([12, 13]);
    });

    it('should handle multiple hunks', async () => {
      const diff = `diff --git a/src/file.ts b/src/file.ts
@@ -5,3 +5,4 @@
   line1
+  newLine1
   line2
@@ -20,3 +21,4 @@
   line3
+  newLine2
   line4
`;

      mockGit.raw.mockResolvedValue(diff);

      const changedLines = await gitService.getChangedLines(
        'src/file.ts',
        'abc123',
        'feature-branch'
      );

      expect(changedLines.has(6)).toBe(true);
      expect(changedLines.has(22)).toBe(true);
    });

    it('should handle modified lines correctly', async () => {
      const diff = `diff --git a/src/file.ts b/src/file.ts
@@ -10,3 +10,3 @@
-  const old = 'old';
+  const new = 'new';
   const unchanged = 1;
`;

      mockGit.raw.mockResolvedValue(diff);

      const changedLines = await gitService.getChangedLines(
        'src/file.ts',
        'abc123',
        'feature-branch'
      );

      expect(changedLines.size).toBe(1);
      expect(changedLines.has(10)).toBe(true);
    });

    it('should return empty set for empty diff', async () => {
      mockGit.raw.mockResolvedValue('');

      const changedLines = await gitService.getChangedLines(
        'src/file.ts',
        'abc123',
        'feature-branch'
      );

      expect(changedLines.size).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockGit.raw.mockRejectedValue(new Error('File not found'));

      const changedLines = await gitService.getChangedLines(
        'src/file.ts',
        'abc123',
        'feature-branch'
      );

      expect(changedLines.size).toBe(0);
    });
  });

  describe('getFileContent', () => {
    it('should get file content from specified branch', async () => {
      mockGit.show.mockResolvedValue('file content');

      const content = await gitService.getFileContent('src/file.ts', 'feature-branch');

      expect(mockGit.show).toHaveBeenCalledWith(['feature-branch:src/file.ts']);
      expect(content).toBe('file content');
    });

    it('should get file content from HEAD if branch not specified', async () => {
      mockGit.show.mockResolvedValue('file content');

      const content = await gitService.getFileContent('src/file.ts');

      expect(mockGit.show).toHaveBeenCalledWith(['HEAD:src/file.ts']);
      expect(content).toBe('file content');
    });

    it('should throw GitError on failure', async () => {
      mockGit.show.mockRejectedValue(new Error('File not found'));

      await expect(gitService.getFileContent('nonexistent.ts')).rejects.toThrow(GitError);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      mockGit.revparse.mockResolvedValue('feature-branch\n');

      const branch = await gitService.getCurrentBranch();

      expect(mockGit.revparse).toHaveBeenCalledWith(['--abbrev-ref', 'HEAD']);
      expect(branch).toBe('feature-branch');
    });
  });

  describe('getBaseCommit', () => {
    it('should return merge base between branches', async () => {
      mockGit.raw.mockResolvedValue('abc123\n');

      const base = await gitService.getBaseCommit('main', 'feature-branch');

      expect(mockGit.raw).toHaveBeenCalledWith(['merge-base', 'main', 'feature-branch']);
      expect(base).toBe('abc123');
    });
  });

  describe('getDiffForFile', () => {
    it('should return diff for specific file', async () => {
      mockGit.raw
        .mockResolvedValueOnce('abc123') // merge-base for detectBaseBranch
        .mockResolvedValueOnce('abc123') // merge-base for getMergeBase
        .mockResolvedValueOnce('diff content'); // actual diff

      const diff = await gitService.getDiffForFile('src/file.ts', 'feature-branch');

      expect(diff).toBe('diff content');
    });

    it('should return empty string on error', async () => {
      mockGit.raw.mockRejectedValue(new Error('Failed'));

      const diff = await gitService.getDiffForFile('src/file.ts', 'feature-branch');

      expect(diff).toBe('');
    });
  });
});
