import { existsSync } from 'fs';
import { join } from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { ChangedFile, FileStatus, GitError } from './types';

// ============================================================================
// Constants
// ============================================================================

const BASE_BRANCH_CANDIDATES = [
  'origin/main',
  'main',
  'origin/master',
  'master',
  'origin/develop',
  'develop',
];

// ============================================================================
// GitService
// ============================================================================

export class GitService {
  private git: SimpleGit;
  public readonly repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    if (!existsSync(join(repoPath, '.git'))) {
      throw new GitError(`Not a git repository: ${repoPath}`);
    }
    this.git = simpleGit(repoPath);
  }

  /**
   * Checkout to a specific branch
   * @param branchName - The branch to checkout
   */
  async checkoutBranch(branchName: string): Promise<void> {
    try {
      await this.git.checkout(branchName);
    } catch (error) {
      const gitError = error instanceof Error ? error : new Error(String(error));
      if (gitError.message?.includes('did not match any file')) {
        try {
          await this.git.fetch('origin', branchName);
          await this.git.checkout(`origin/${branchName}`);
        } catch (fetchError) {
          throw new GitError(
            `Failed to checkout branch: ${branchName}`,
            fetchError instanceof Error ? fetchError : undefined
          );
        }
      } else {
        throw new GitError(`Failed to checkout branch: ${branchName}`, gitError);
      }
    }
  }

  /**
   * Get files changed in targetBranch compared to baseBranch
   * @param targetBranch - The feature/PR branch with changes
   * @param baseBranch - Optional base branch to compare against
   */
  async getChangedFiles(targetBranch: string, baseBranch?: string): Promise<ChangedFile[]> {
    await this.fetchBranch(targetBranch);

    const resolvedBaseBranch = baseBranch ?? (await this.detectBaseBranch(targetBranch));
    await this.fetchBaseBranch(resolvedBaseBranch);

    console.log(`Comparing ${targetBranch} against base: ${resolvedBaseBranch}`);

    const mergeBase = await this.getMergeBase(resolvedBaseBranch, targetBranch);
    const commits = await this.getUniqueCommits(mergeBase, targetBranch);

    if (commits.length === 0) {
      console.log(`No commits found in ${targetBranch} that are not in ${resolvedBaseBranch}`);
      return [];
    }

    console.log(
      `Found ${commits.length} commit(s) unique to ${targetBranch}: ${commits
        .slice(0, 3)
        .map((c) => c.split(' ')[0])
        .join(', ')}${commits.length > 3 ? '...' : ''}`
    );

    const changedFiles = await this.parseChangedFiles(mergeBase, targetBranch);
    console.log(`Changed files in ${targetBranch}:`, changedFiles.map((f) => f.path).join(', '));

    return changedFiles;
  }

  /**
   * Parse diff to extract line numbers that were changed
   * @param filePath - Path to the file
   * @param mergeBase - The merge base commit
   * @param targetBranch - The target branch
   */
  async getChangedLines(
    filePath: string,
    mergeBase: string,
    targetBranch: string
  ): Promise<Set<number>> {
    const changedLines = new Set<number>();

    try {
      const diff = await this.git.raw(['diff', `${mergeBase}..${targetBranch}`, '--', filePath]);

      if (!diff || diff.trim().length === 0) {
        return changedLines;
      }

      const lines = diff.split('\n');
      let currentLineInTarget = 0;
      let inHunk = false;

      for (const line of lines) {
        if (line.startsWith('@@')) {
          const hunkMatch = line.match(/@@\s*-\d+(?:,\d+)?\s*\+(\d+)(?:,(\d+))?/);
          if (hunkMatch?.[1]) {
            currentLineInTarget = parseInt(hunkMatch[1], 10);
            inHunk = true;
            continue;
          }
        }

        if (!inHunk) continue;

        if (line.startsWith('+') && !line.startsWith('+++')) {
          changedLines.add(currentLineInTarget);
          currentLineInTarget++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          // Deletions don't increment the target line counter
        } else if (line.startsWith(' ')) {
          currentLineInTarget++;
        }
        // Empty lines and diff markers are ignored
      }
    } catch (error) {
      console.warn(`Failed to parse diff for ${filePath}:`, error);
    }

    return changedLines;
  }

  /**
   * Get file content from a specific branch
   * @param filePath - Path to the file
   * @param branch - Optional branch name (defaults to HEAD)
   */
  async getFileContent(filePath: string, branch?: string): Promise<string> {
    const ref = branch ?? 'HEAD';
    try {
      return await this.git.show([`${ref}:${filePath}`]);
    } catch (error) {
      throw new GitError(
        `Failed to get file content: ${filePath}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  }

  /**
   * Get the merge base between two branches
   * @param baseBranch - The base branch
   * @param targetBranch - The target branch
   */
  async getBaseCommit(baseBranch: string, targetBranch: string): Promise<string> {
    const mergeBase = await this.git.raw(['merge-base', baseBranch, targetBranch]);
    return mergeBase.trim();
  }

  /**
   * Get diff for a specific file between base and target branch
   * @param filePath - Path to the file
   * @param targetBranch - The feature/PR branch
   * @param baseBranch - Optional base branch to compare against
   */
  async getDiffForFile(
    filePath: string,
    targetBranch: string,
    baseBranch?: string
  ): Promise<string> {
    try {
      const resolvedBaseBranch = baseBranch ?? (await this.detectBaseBranch(targetBranch));
      const mergeBase = await this.getMergeBase(resolvedBaseBranch, targetBranch);
      return await this.git.raw(['diff', `${mergeBase}..${targetBranch}`, '--', filePath]);
    } catch {
      return '';
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async fetchBranch(branch: string): Promise<void> {
    try {
      await this.git.fetch(['origin', branch]);
    } catch {
      // Branch might be local only, continue silently
    }
  }

  private async fetchBaseBranch(baseBranch: string): Promise<void> {
    if (baseBranch.startsWith('origin/')) {
      try {
        await this.git.fetch(['origin', baseBranch.replace('origin/', '')]);
      } catch {
        // May already be fetched or not exist
      }
    }
  }

  private async detectBaseBranch(targetBranch: string): Promise<string> {
    for (const candidate of BASE_BRANCH_CANDIDATES) {
      try {
        await this.git.raw(['merge-base', candidate, targetBranch]);
        console.log(`Auto-detected base branch: ${candidate}`);
        return candidate;
      } catch {
        // This candidate doesn't work, try next
      }
    }

    console.warn('Could not auto-detect base branch, using first commit as base');
    const output = await this.git.raw(['rev-list', '--max-parents=0', 'HEAD']);
    const firstCommit = output.trim().split('\n')[0];
    return firstCommit ?? 'HEAD';
  }

  private async getMergeBase(baseBranch: string, targetBranch: string): Promise<string> {
    try {
      return await this.git.raw(['merge-base', baseBranch, targetBranch]).then((r) => r.trim());
    } catch {
      console.warn(`Could not find merge-base, using ${baseBranch} directly`);
      return baseBranch;
    }
  }

  private async getUniqueCommits(mergeBase: string, targetBranch: string): Promise<string[]> {
    try {
      const output = await this.git.raw(['log', '--oneline', `${mergeBase}..${targetBranch}`]);
      return output
        .trim()
        .split('\n')
        .filter((line) => line.trim());
    } catch {
      return [];
    }
  }

  private async parseChangedFiles(mergeBase: string, targetBranch: string): Promise<ChangedFile[]> {
    const diffSummary = await this.git.raw(['diff', '--numstat', `${mergeBase}..${targetBranch}`]);
    const changedFiles: ChangedFile[] = [];

    const lines = diffSummary
      .trim()
      .split('\n')
      .filter((line) => line.trim());

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;

      const additionsStr = parts[0];
      const deletionsStr = parts[1];
      const filePath = parts[2];

      if (!additionsStr || !deletionsStr || !filePath) continue;

      const additions = parseInt(additionsStr, 10);
      const deletions = parseInt(deletionsStr, 10);

      // Skip binary files (indicated by -)
      if (isNaN(additions) || isNaN(deletions)) continue;

      if (additions > 0 || deletions > 0) {
        const status = this.determineFileStatus(additions, deletions);
        if (status) {
          const changedLines = await this.getChangedLines(filePath, mergeBase, targetBranch);
          changedFiles.push({
            path: filePath,
            status,
            additions,
            deletions,
            changedLines,
          });
        }
      }
    }

    return changedFiles;
  }

  private determineFileStatus(additions: number, deletions: number): FileStatus | null {
    if (additions > 0 && deletions === 0) return 'added';
    if (additions === 0 && deletions > 0) return 'deleted';
    if (additions > 0 && deletions > 0) return 'modified';
    return null;
  }
}
