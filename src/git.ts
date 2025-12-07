import { existsSync } from 'fs';
import { join } from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { ChangedFile } from './types';

export class GitService {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    if (!existsSync(join(repoPath, '.git'))) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }
    this.git = simpleGit(repoPath);
  }

  async checkoutBranch(branchName: string): Promise<void> {
    try {
      await this.git.checkout(branchName);
    } catch (error: any) {
      if (error.message?.includes('did not match any file')) {
        // Try to fetch and checkout remote branch
        await this.git.fetch('origin', branchName);
        await this.git.checkout(`origin/${branchName}`);
      } else {
        throw error;
      }
    }
  }

  async getChangedFiles(baseBranch: string, targetBranch: string): Promise<ChangedFile[]> {
    await this.git.fetch(['origin', baseBranch, targetBranch]);

    const diffSummary = await this.git.diffSummary([baseBranch, targetBranch]);
    const changedFiles: ChangedFile[] = [];

    for (const file of diffSummary.files) {
      if (file.binary) continue;

      const status = this.mapGitStatus(file);
      if (status) {
        // Get changed line numbers for this file
        const changedLines = await this.getChangedLines(file.file, baseBranch, targetBranch);

        changedFiles.push({
          path: file.file,
          status,
          additions: file.insertions,
          deletions: file.deletions,
          changedLines,
        });
      }
    }

    return changedFiles;
  }

  /**
   * Parse diff to extract line numbers that were changed (added/modified) in the target branch
   * Returns a Set of line numbers (1-indexed) that were added or modified
   */
  async getChangedLines(filePath: string, baseBranch: string, targetBranch: string): Promise<Set<number>> {
    const changedLines = new Set<number>();

    try {
      const diff = await this.git.diff([baseBranch, targetBranch, '--', filePath]);

      // If diff is empty, return empty set
      if (!diff || diff.trim().length === 0) {
        return changedLines;
      }

      const lines = diff.split('\n');
      let currentLineInTarget = 0;
      let inHunk = false;

      for (const line of lines) {
        // Hunk header: @@ -old_start,old_count +new_start,new_count @@
        // Example: @@ -10,5 +10,7 @@ means lines 10-14 in old, 10-16 in new
        if (line.startsWith('@@')) {
          const hunkMatch = line.match(/@@\s*-\d+(?:,\d+)?\s*\+(\d+)(?:,(\d+))?/);
          if (hunkMatch) {
            currentLineInTarget = parseInt(hunkMatch[1], 10);
            inHunk = true;
            continue;
          }
        }

        if (!inHunk) continue;

        // Lines starting with + are additions/modifications in target branch
        // (modifications appear as deletion followed by addition)
        if (line.startsWith('+') && !line.startsWith('+++')) {
          changedLines.add(currentLineInTarget);
          currentLineInTarget++;
        }
        // Lines starting with - are deletions in base branch
        // (don't increment target line counter for deletions)
        else if (line.startsWith('-') && !line.startsWith('---')) {
          // Don't increment currentLineInTarget for deletions
        }
        // Lines starting with space are context (unchanged lines)
        else if (line.startsWith(' ')) {
          currentLineInTarget++;
        }
        // Handle empty lines and diff markers
        else if (line.trim().length === 0 || line.startsWith('\\')) {
          // No-op for empty lines or diff markers
        }
      }
    } catch (error) {
      console.warn(`Failed to parse diff for ${filePath}:`, error);
    }

    return changedLines;
  }

  async getFileContent(filePath: string, branch?: string): Promise<string> {
    if (branch) {
      return await this.git.show([`${branch}:${filePath}`]);
    }
    return await this.git.show([`HEAD:${filePath}`]);
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  }

  async getBaseCommit(baseBranch: string, targetBranch: string): Promise<string> {
    const mergeBase = await this.git.raw(['merge-base', baseBranch, targetBranch]);
    return mergeBase.trim();
  }

  private mapGitStatus(file: any): ChangedFile['status'] | null {
    if (file.insertions > 0 && file.deletions === 0) return 'added';
    if (file.insertions === 0 && file.deletions > 0) return 'deleted';
    if (file.insertions > 0 && file.deletions > 0) return 'modified';
    return null;
  }

  async getDiffForFile(filePath: string, baseBranch: string, targetBranch: string): Promise<string> {
    try {
      const diff = await this.git.diff([baseBranch, targetBranch, '--', filePath]);
      return diff;
    } catch (error) {
      return '';
    }
  }
}
