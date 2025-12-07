import chalk from 'chalk';
import { AIProviderFactory, AIProviderInterface } from './ai-provider';
import { ChunkService } from './chunker';
import { GitService } from './git';
import { PRCommentService, PRCommentServiceFactory } from './pr-comments';
import { ChangedFile, Config, ReviewComment, ReviewResult } from './types';

export class PRReviewer {
  private config: Config;
  private git: GitService;
  private chunker: ChunkService;
  private aiProvider: AIProviderInterface;
  private prCommentService: PRCommentService;

  constructor(config: Config, repoPath?: string) {
    this.config = config;
    this.git = new GitService(repoPath);
    this.chunker = new ChunkService(repoPath);
    this.aiProvider = AIProviderFactory.create(config);
    this.prCommentService = PRCommentServiceFactory.create(config);
  }

  async reviewPR(
    targetBranch: string,
    baseBranch?: string,
    postComments: boolean = true
  ): Promise<ReviewResult> {
    const base = baseBranch || this.config.repository.baseBranch;

    console.log(chalk.blue(`📋 Starting PR review...`));
    console.log(chalk.gray(`Base branch: ${base}`));
    console.log(chalk.gray(`Target branch: ${targetBranch}`));

    // Step 1: Checkout to target branch
    console.log(chalk.blue(`\n🔀 Checking out to branch: ${targetBranch}`));
    await this.git.checkoutBranch(targetBranch);

    // Step 2: Get changed files
    console.log(chalk.blue(`\n📁 Detecting changed files...`));
    const changedFiles = await this.git.getChangedFiles(base, targetBranch);
    console.log(chalk.green(`Found ${changedFiles.length} changed file(s)`));

    if (changedFiles.length === 0) {
      console.log(chalk.yellow('No files changed, nothing to review.'));
      return {
        comments: [],
        summary: 'No files changed in this PR.',
        stats: {
          errors: 0,
          warnings: 0,
          suggestions: 0,
        },
      };
    }

    // Step 3: Chunk the changed files
    console.log(chalk.blue(`\n🔪 Chunking code using chunkyyy...`));
    const chunks = await this.chunker.chunkChangedFiles(changedFiles, targetBranch);
    console.log(chalk.green(`Generated ${chunks.length} code chunk(s)`));

    if (chunks.length === 0) {
      console.log(chalk.yellow('No code chunks generated, nothing to review.'));
      return {
        comments: [],
        summary: 'No code chunks could be generated from changed files.',
        stats: {
          errors: 0,
          warnings: 0,
          suggestions: 0,
        },
      };
    }

    // Step 4: Review code with AI
    console.log(chalk.blue(`\n🤖 Reviewing code with ${this.config.aiProvider}...`));
    console.log(chalk.gray(`Using ${chunks.length} chunk(s) and ${this.config.globalRules.length} rule(s)`));

    const reviewResult = await this.aiProvider.reviewCode(chunks, this.config.globalRules);

    // Step 5: Filter comments to only include changed lines
    console.log(chalk.blue(`\n🔍 Filtering comments to changed lines only...`));
    const filteredComments = this.filterCommentsToChangedLines(reviewResult.comments, changedFiles);
    const filteredResult: ReviewResult = {
      ...reviewResult,
      comments: filteredComments,
      stats: {
        errors: filteredComments.filter(c => c.severity === 'error').length,
        warnings: filteredComments.filter(c => c.severity === 'warning').length,
        suggestions: filteredComments.filter(c => c.severity === 'suggestion' || c.severity === 'info').length,
      },
    };

    console.log(chalk.gray(`Filtered from ${reviewResult.comments.length} to ${filteredComments.length} comment(s) on changed lines`));

    // Step 6: Display results
    console.log(chalk.blue(`\n📊 Review Results:`));
    console.log(chalk.gray(`Summary: ${filteredResult.summary}`));
    console.log(chalk.red(`Errors: ${filteredResult.stats.errors}`));
    console.log(chalk.yellow(`Warnings: ${filteredResult.stats.warnings}`));
    console.log(chalk.blue(`Suggestions: ${filteredResult.stats.suggestions}`));

    // Step 7: Post comments to PR
    if (postComments && this.config.pr?.number) {
      console.log(chalk.blue(`\n💬 Posting comments to PR #${this.config.pr.number}...`));

      if (filteredComments.length > 0) {
        await this.prCommentService.postComments(filteredComments, this.config.pr.number);
        console.log(chalk.green(`Posted ${filteredComments.length} comment(s)`));
      } else {
        console.log(chalk.yellow('No comments on changed lines to post'));
      }

      await this.prCommentService.postReviewSummary(filteredResult, this.config.pr.number);
      console.log(chalk.green('Posted review summary'));
    } else if (postComments && !this.config.pr?.number) {
      console.log(chalk.yellow('PR number not configured, skipping comment posting'));
    }

    return filteredResult;
  }

  async reviewFile(
    filePath: string,
    branch: string,
    startLine?: number,
    endLine?: number
  ): Promise<ReviewResult> {
    console.log(chalk.blue(`📋 Reviewing file: ${filePath}`));

    let chunks;
    if (startLine && endLine) {
      // Use range-based chunking
      console.log(chalk.blue(`Using range ${startLine}-${endLine}`));
      const chunk = await this.chunker.chunkFileByRange(filePath, startLine, endLine, branch);
      chunks = [chunk];
    } else {
      // Use full file chunking
      chunks = await this.chunker.chunkFile(filePath, branch);
    }

    console.log(chalk.green(`Generated ${chunks.length} code chunk(s)`));

    const reviewResult = await this.aiProvider.reviewCode(chunks, this.config.globalRules);

    console.log(chalk.blue(`\n📊 Review Results:`));
    console.log(chalk.gray(`Summary: ${reviewResult.summary}`));
    console.log(chalk.red(`Errors: ${reviewResult.stats.errors}`));
    console.log(chalk.yellow(`Warnings: ${reviewResult.stats.warnings}`));
    console.log(chalk.blue(`Suggestions: ${reviewResult.stats.suggestions}`));

    return reviewResult;
  }

  /**
   * Filter comments to only include those on lines that were changed in the diff
   */
  private filterCommentsToChangedLines(
    comments: ReviewComment[],
    changedFiles: ChangedFile[]
  ): ReviewComment[] {
    // Create a map of file paths to their changed line sets
    const changedLinesMap = new Map<string, Set<number>>();

    for (const file of changedFiles) {
      if (file.changedLines && file.changedLines.size > 0) {
        changedLinesMap.set(file.path, file.changedLines);
      }
    }

    return comments.filter(comment => {
      const changedLines = changedLinesMap.get(comment.file);

      // If file has no changed lines info, skip the comment
      if (!changedLines) {
        return false;
      }

      // For added files, include all comments
      const file = changedFiles.find(f => f.path === comment.file);
      if (file?.status === 'added') {
        return true;
      }

      // Check if the comment line is in the changed lines set
      return changedLines.has(comment.line);
    });
  }
}
