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
        changedFiles.push({
          path: file.file,
          status,
          additions: file.insertions,
          deletions: file.deletions,
        });
      }
    }

    return changedFiles;
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
