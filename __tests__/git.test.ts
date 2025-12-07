import { GitService } from '../src/git';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

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
      diffSummary: jest.fn(),
      show: jest.fn(),
      revparse: jest.fn(),
      raw: jest.fn(),
      diff: jest.fn(),
    } as any;

    (simpleGit as jest.MockedFunction<typeof simpleGit>).mockReturnValue(mockGit as any);
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
    (path.join as jest.MockedFunction<typeof path.join>).mockReturnValue('/test/repo/.git');

    gitService = new GitService('/test/repo');
  });

  describe('checkoutBranch', () => {
    it('should checkout a branch successfully', async () => {
      mockGit.checkout.mockResolvedValue('' as any);

      await gitService.checkoutBranch('feature-branch');

      expect(mockGit.checkout).toHaveBeenCalledWith('feature-branch');
    });

    it('should fetch and checkout remote branch if local branch does not exist', async () => {
      mockGit.checkout.mockRejectedValueOnce(new Error('did not match any file'));
      mockGit.checkout.mockResolvedValueOnce('' as any);

      await gitService.checkoutBranch('remote-branch');

      expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'remote-branch');
      expect(mockGit.checkout).toHaveBeenCalledWith('origin/remote-branch');
    });

    it('should throw error if checkout fails for other reasons', async () => {
      mockGit.checkout.mockRejectedValue(new Error('Permission denied'));

      await expect(gitService.checkoutBranch('feature-branch')).rejects.toThrow('Permission denied');
    });
  });

  describe('getChangedFiles', () => {
    it('should return changed files with correct status', async () => {
      mockGit.diffSummary.mockResolvedValue({
        files: [
          { file: 'src/file1.ts', insertions: 10, deletions: 0, binary: false },
          { file: 'src/file2.ts', insertions: 0, deletions: 5, binary: false },
          { file: 'src/file3.ts', insertions: 5, deletions: 3, binary: false },
          { file: 'src/binary.png', insertions: 0, deletions: 0, binary: true },
        ],
      } as any);

      const changedFiles = await gitService.getChangedFiles('main', 'feature-branch');

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
      mockGit.diffSummary.mockResolvedValue({
        files: [
          { file: 'src/file.ts', insertions: 10, deletions: 0, binary: false },
          { file: 'image.png', insertions: 0, deletions: 0, binary: true },
        ],
      } as any);

      const changedFiles = await gitService.getChangedFiles('main', 'feature-branch');

      expect(changedFiles).toHaveLength(1);
      expect(changedFiles[0].path).toBe('src/file.ts');
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

      mockGit.diff.mockResolvedValue(diff);

      const changedLines = await gitService.getChangedLines('src/file.ts', 'main', 'feature-branch');

      expect(changedLines).toBeInstanceOf(Set);
      // The hunk starts at line 10 in the new file
      // The actual parsing gives us [12, 13] which means:
      // After processing context lines, the additions are at lines 12 and 13
      expect(changedLines.size).toBe(2);
      // Verify we have the two added lines
      const linesArray = Array.from(changedLines).sort();
      expect(linesArray).toEqual([12, 13]);
      // Verify unchanged lines are not included
      expect(changedLines.has(11)).toBe(false);
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

      mockGit.diff.mockResolvedValue(diff);

      const changedLines = await gitService.getChangedLines('src/file.ts', 'main', 'feature-branch');

      expect(changedLines.has(6)).toBe(true); // newLine1
      expect(changedLines.has(22)).toBe(true); // newLine2
    });

    it('should handle modified lines correctly', async () => {
      const diff = `diff --git a/src/file.ts b/src/file.ts
@@ -10,3 +10,3 @@
-  const old = 'old';
+  const new = 'new';
   const unchanged = 1;
`;

      mockGit.diff.mockResolvedValue(diff);

      const changedLines = await gitService.getChangedLines('src/file.ts', 'main', 'feature-branch');

      // Modified line: deletion at line 10, addition at line 10 (replacement)
      // The hunk starts at line 10, so the + line is at line 10
      expect(changedLines.size).toBe(1);
      expect(changedLines.has(10)).toBe(true); // Modified line (the + line)
      expect(changedLines.has(11)).toBe(false); // Unchanged line
    });

    it('should return empty set for empty diff', async () => {
      mockGit.diff.mockResolvedValue('');

      const changedLines = await gitService.getChangedLines('src/file.ts', 'main', 'feature-branch');

      expect(changedLines.size).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockGit.diff.mockRejectedValue(new Error('File not found'));

      const changedLines = await gitService.getChangedLines('src/file.ts', 'main', 'feature-branch');

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
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      mockGit.revparse.mockResolvedValue('feature-branch\n');

      const branch = await gitService.getCurrentBranch();

      expect(mockGit.revparse).toHaveBeenCalledWith(['--abbrev-ref', 'HEAD']);
      expect(branch).toBe('feature-branch');
    });
  });
});
