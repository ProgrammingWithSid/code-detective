import chalk from 'chalk';
import { AIProviderFactory, AIProviderInterface } from './ai-provider';
import { ChunkService } from './chunker';
import { GitService } from './git';
import { PRCommentService, PRCommentServiceFactory } from './pr-comments';
import {
  ChangedFile,
  CodeChunk,
  Config,
  LineRange,
  ReviewComment,
  ReviewResult,
  ReviewStats,
  Severity,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const SEVERITY_COLOR: Record<Severity, typeof chalk.red> = {
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  suggestion: chalk.cyan,
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  error: '🔴',
  warning: '🟡',
  info: 'ℹ️',
  suggestion: '💡',
};

// ============================================================================
// PRReviewer
// ============================================================================

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

  /**
   * Review a PR by branch name
   * @param targetBranch - The feature/PR branch to review
   * @param postComments - Whether to post comments to the PR
   * @param baseBranchOverride - Optional base branch override
   */
  async reviewPR(
    targetBranch: string,
    postComments: boolean = true,
    baseBranchOverride?: string
  ): Promise<ReviewResult> {
    const baseBranch = this.resolveBaseBranch(baseBranchOverride);

    this.logReviewStart(targetBranch, baseBranch);

    // Step 1: Checkout to target branch
    console.log(chalk.blue(`\n🔀 Checking out to branch: ${targetBranch}`));
    await this.git.checkoutBranch(targetBranch);

    // Step 2: Get changed files
    console.log(chalk.blue(`\n📁 Detecting changes unique to ${targetBranch}...`));
    const changedFiles = await this.git.getChangedFiles(targetBranch, baseBranch);
    console.log(chalk.green(`Found ${changedFiles.length} changed file(s)`));

    if (changedFiles.length === 0) {
      return this.createEmptyResult('No files changed in this PR.');
    }

    // Step 3: Chunk the changed files
    console.log(chalk.blue(`\n🔪 Chunking code using chunkyyy...`));
    const chunks = await this.chunker.chunkChangedFiles(changedFiles, targetBranch);
    console.log(chalk.green(`Generated ${chunks.length} code chunk(s)`));

    if (chunks.length === 0) {
      return this.createEmptyResult('No code chunks could be generated from changed files.');
    }

    // Step 4: Review code with AI
    console.log(chalk.blue(`\n🤖 Reviewing code with ${this.config.aiProvider}...`));
    console.log(
      chalk.gray(`Using ${chunks.length} chunk(s) and ${this.config.globalRules.length} rule(s)`)
    );

    const reviewResult = await this.aiProvider.reviewCode(chunks, this.config.globalRules);

    // Step 5: Display all comments
    this.displayAllComments(reviewResult);

    // Step 6: Filter comments to changed lines
    const filteredResult = this.filterAndDisplayFilteredComments(
      reviewResult,
      changedFiles,
      chunks
    );

    // Step 7: Post comments to PR
    await this.postCommentsIfEnabled(postComments, filteredResult);

    return filteredResult;
  }

  /**
   * Review a specific file
   * @param filePath - Path to the file
   * @param branch - Branch name
   * @param startLine - Optional start line
   * @param endLine - Optional end line
   */
  async reviewFile(
    filePath: string,
    branch: string,
    startLine?: number,
    endLine?: number
  ): Promise<ReviewResult> {
    console.log(chalk.blue(`📋 Reviewing file: ${filePath}`));

    const chunks = await this.getFileChunks(filePath, branch, startLine, endLine);
    console.log(chalk.green(`Generated ${chunks.length} code chunk(s)`));

    const reviewResult = await this.aiProvider.reviewCode(chunks, this.config.globalRules);
    this.displayReviewSummary(reviewResult);

    return reviewResult;
  }

  // ============================================================================
  // Private Methods - Branch Resolution
  // ============================================================================

  private resolveBaseBranch(override?: string): string | undefined {
    return override ?? this.config.pr?.baseBranch ?? this.config.repository?.baseBranch;
  }

  // ============================================================================
  // Private Methods - Logging
  // ============================================================================

  private logReviewStart(targetBranch: string, baseBranch?: string): void {
    console.log(chalk.blue(`📋 Starting PR review...`));
    console.log(chalk.gray(`Target branch: ${targetBranch}`));
    console.log(chalk.gray(`Base branch: ${baseBranch ?? 'auto-detect'}`));
  }

  private displayAllComments(result: ReviewResult): void {
    console.log(chalk.blue(`\n📝 All Review Comments:`));

    if (result.comments.length === 0) {
      console.log(chalk.green(`   ✅ No issues found!`));
      return;
    }

    result.comments.forEach((comment, index) => {
      this.displayComment(comment, index + 1);
    });
  }

  private displayComment(comment: ReviewComment, index: number): void {
    const colorFn = SEVERITY_COLOR[comment.severity] ?? chalk.gray;
    const emoji = SEVERITY_EMOJI[comment.severity] ?? '•';

    console.log(colorFn(`\n${index}. ${emoji} ${comment.severity.toUpperCase()}`));
    console.log(chalk.gray(`   File: ${comment.file}:${comment.line}`));
    if (comment.rule) {
      console.log(chalk.gray(`   Rule: ${comment.rule}`));
    }
    console.log(`   ${comment.body}`);
  }

  private displayReviewSummary(result: ReviewResult): void {
    console.log(chalk.blue(`\n📊 Review Results:`));
    console.log(chalk.gray(`Summary: ${result.summary}`));
    console.log(chalk.red(`Errors: ${result.stats.errors}`));
    console.log(chalk.yellow(`Warnings: ${result.stats.warnings}`));
    console.log(chalk.blue(`Suggestions: ${result.stats.suggestions}`));
  }

  // ============================================================================
  // Private Methods - Filtering
  // ============================================================================

  private filterAndDisplayFilteredComments(
    reviewResult: ReviewResult,
    changedFiles: ChangedFile[],
    chunks: CodeChunk[]
  ): ReviewResult {
    console.log(
      chalk.blue(`\n🔍 Filtering comments to changed lines and their parent functions...`)
    );

    const filteredComments = this.filterCommentsToChangedLines(
      reviewResult.comments,
      changedFiles,
      chunks
    );

    const filteredResult: ReviewResult = {
      ...reviewResult,
      comments: filteredComments,
      stats: this.calculateStats(filteredComments),
    };

    console.log(
      chalk.gray(
        `Filtered from ${reviewResult.comments.length} to ${filteredComments.length} comment(s) on changed lines/functions`
      )
    );

    if (reviewResult.comments.length > filteredComments.length) {
      const filteredOut = reviewResult.comments.length - filteredComments.length;
      console.log(
        chalk.yellow(
          `   ⚠️  ${filteredOut} comment(s) were outside changed functions and will not be posted to PR`
        )
      );
    }

    this.displayFilteredResults(filteredResult, filteredComments);

    return filteredResult;
  }

  private displayFilteredResults(result: ReviewResult, comments: ReviewComment[]): void {
    console.log(chalk.blue(`\n📊 Review Results (for PR comments):`));
    console.log(chalk.gray(`Summary: ${result.summary}`));
    console.log(chalk.red(`Errors: ${result.stats.errors}`));
    console.log(chalk.yellow(`Warnings: ${result.stats.warnings}`));
    console.log(chalk.blue(`Suggestions: ${result.stats.suggestions}`));

    if (comments.length > 0) {
      console.log(chalk.blue(`\n💬 Comments to be posted to PR:`));
      comments.forEach((comment, index) => {
        this.displayComment(comment, index + 1);
      });
    } else {
      console.log(chalk.yellow(`\n⚠️  No comments on changed lines to post to PR`));
    }
  }

  private filterCommentsToChangedLines(
    comments: ReviewComment[],
    changedFiles: ChangedFile[],
    chunks: CodeChunk[]
  ): ReviewComment[] {
    const changedLinesMap = this.buildChangedLinesMap(changedFiles);
    const relevantRangesMap = this.buildRelevantRangesMap(changedLinesMap, chunks);

    return comments.filter((comment) => {
      const changedLines = changedLinesMap.get(comment.file);

      if (!changedLines) {
        return false;
      }

      // Include all comments for added files
      const file = changedFiles.find((f) => f.path === comment.file);
      if (file?.status === 'added') {
        return true;
      }

      // Check if comment is in a relevant range
      const relevantRanges = relevantRangesMap.get(comment.file);
      if (relevantRanges) {
        for (const range of relevantRanges) {
          if (comment.line >= range.startLine && comment.line <= range.endLine) {
            return true;
          }
        }
      }

      // Fallback: check direct line match
      return changedLines.has(comment.line);
    });
  }

  private buildChangedLinesMap(changedFiles: ChangedFile[]): Map<string, Set<number>> {
    const map = new Map<string, Set<number>>();

    for (const file of changedFiles) {
      if (file.changedLines && file.changedLines.size > 0) {
        map.set(file.path, file.changedLines);
      }
    }

    return map;
  }

  private buildRelevantRangesMap(
    changedLinesMap: Map<string, Set<number>>,
    chunks: CodeChunk[]
  ): Map<string, LineRange[]> {
    const map = new Map<string, LineRange[]>();

    for (const [filePath, changedLines] of changedLinesMap) {
      const fileChunks = chunks.filter((chunk) => chunk.file === filePath);
      const relevantRanges: LineRange[] = [];

      for (const chunk of fileChunks) {
        for (const changedLine of changedLines) {
          if (changedLine >= chunk.startLine && changedLine <= chunk.endLine) {
            relevantRanges.push({
              startLine: chunk.startLine,
              endLine: chunk.endLine,
            });
            break;
          }
        }
      }

      if (relevantRanges.length > 0) {
        map.set(filePath, relevantRanges);
      }
    }

    return map;
  }

  // ============================================================================
  // Private Methods - Stats
  // ============================================================================

  private calculateStats(comments: ReviewComment[]): ReviewStats {
    return {
      errors: comments.filter((c) => c.severity === 'error').length,
      warnings: comments.filter((c) => c.severity === 'warning').length,
      suggestions: comments.filter((c) => c.severity === 'suggestion' || c.severity === 'info')
        .length,
    };
  }

  // ============================================================================
  // Private Methods - Result Creation
  // ============================================================================

  private createEmptyResult(message: string): ReviewResult {
    console.log(chalk.yellow(message));
    return {
      comments: [],
      summary: message,
      stats: {
        errors: 0,
        warnings: 0,
        suggestions: 0,
      },
    };
  }

  // ============================================================================
  // Private Methods - File Operations
  // ============================================================================

  private async getFileChunks(
    filePath: string,
    branch: string,
    startLine?: number,
    endLine?: number
  ): Promise<CodeChunk[]> {
    if (startLine !== undefined && endLine !== undefined) {
      console.log(chalk.blue(`Using range ${startLine}-${endLine}`));
      const chunk = await this.chunker.chunkFileByRange(filePath, startLine, endLine, branch);
      return [chunk];
    }

    return await this.chunker.chunkFile(filePath, branch);
  }

  // ============================================================================
  // Private Methods - Comment Posting
  // ============================================================================

  private async postCommentsIfEnabled(postComments: boolean, result: ReviewResult): Promise<void> {
    if (!postComments) {
      return;
    }

    const prNumber = this.config.pr?.number;

    if (!prNumber) {
      console.log(chalk.yellow('PR number not configured, skipping comment posting'));
      return;
    }

    console.log(chalk.blue(`\n💬 Posting comments to PR #${prNumber}...`));

    if (result.comments.length > 0) {
      await this.prCommentService.postComments(result.comments, prNumber);
      console.log(chalk.green(`Posted ${result.comments.length} comment(s)`));
    } else {
      console.log(chalk.yellow('No comments on changed lines to post'));
    }

    await this.prCommentService.postReviewSummary(result, prNumber);
    console.log(chalk.green('Posted review summary'));
  }
}
