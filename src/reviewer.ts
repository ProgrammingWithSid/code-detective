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
  ReviewResultJSON,
  ReviewStats,
  Severity,
} from './types';
import { ChunkBatcher } from './utils/chunk-batcher';
import { CommentDeduplicator } from './utils/comment-deduplicator';
import { ParallelReviewer } from './utils/parallel-reviewer';
import { ReviewCache } from './utils/review-cache';
import { ReviewTracker } from './utils/review-tracker';
import { RuleBasedFilter } from './utils/rule-based-filter';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert ReviewResult to a structured JSON format for export/integration
 */
export function reviewResultToJSON(
  result: ReviewResult,
  target: string,
  baseBranch: string,
  aiProvider?: string,
  model?: string,
  duration?: number
): ReviewResultJSON {
  return {
    metadata: {
      reviewedAt: new Date().toISOString(),
      target,
      baseBranch,
      duration,
      aiProvider,
      model,
    },
    summary: {
      recommendation: result.recommendation || 'N/A',
      totalIssues: result.comments.length,
      errors: result.stats.errors,
      warnings: result.stats.warnings,
      suggestions: result.stats.suggestions,
      topIssues: result.topIssues || [],
      description: result.summary,
    },
    comments: result.comments.map((c) => ({
      file: c.file,
      line: c.line,
      severity: c.severity,
      category: c.category || c.rule || 'general',
      message: c.body,
      fix: c.fix || null,
    })),
  };
}

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
  protected git: GitService;
  protected chunker: ChunkService;
  protected aiProvider: AIProviderInterface;
  protected prCommentService: PRCommentService;
  private reviewCache: ReviewCache;
  private chunkBatcher: ChunkBatcher;
  private parallelReviewer: ParallelReviewer;
  private ruleBasedFilter: RuleBasedFilter;
  private commentDeduplicator: CommentDeduplicator;
  private reviewTracker?: ReviewTracker;

  constructor(config: Config, repoPath?: string) {
    this.config = config;
    const resolvedRepoPath: string = repoPath ?? process.cwd();
    this.git = new GitService(resolvedRepoPath);
    this.chunker = new ChunkService(resolvedRepoPath);
    this.aiProvider = AIProviderFactory.create(config);
    this.prCommentService = PRCommentServiceFactory.create(config);

    // Initialize review cache (24 hour TTL, max 500 cached reviews)
    const cacheTTL = config.reviewCache?.ttl || 24 * 60 * 60 * 1000;
    const cacheMaxSize = config.reviewCache?.maxSize || 500;
    this.reviewCache = new ReviewCache(cacheTTL, cacheMaxSize);

    // Initialize chunk batcher and parallel reviewer
    this.chunkBatcher = new ChunkBatcher({
      maxTokens: config.batching?.maxTokens || 8000,
      maxChunks: config.batching?.maxChunks || 50,
      groupByFile: config.batching?.groupByFile ?? true,
    });

    this.parallelReviewer = new ParallelReviewer({
      concurrency: config.parallel?.concurrency || 3,
      timeout: config.parallel?.timeout || 60000,
    });

    // Initialize rule-based filter
    this.ruleBasedFilter = new RuleBasedFilter();

    // Initialize comment deduplicator
    this.commentDeduplicator = new CommentDeduplicator(0.6);

    // Initialize review tracker for incremental reviews (if enabled)
    const incrementalReview = config.incrementalReview;
    if (incrementalReview && incrementalReview.enabled) {
      const storagePath = String(incrementalReview.storagePath || '.sherlock-reviews');
      const maxHistorySize = Number(incrementalReview.maxHistorySize || 10000);
      this.reviewTracker = new ReviewTracker(storagePath, maxHistorySize);
    }
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
    const checkoutPromise: Promise<void> = this.git.checkoutBranch(targetBranch);
    await checkoutPromise;

    // Step 2: Get changed files
    console.log(chalk.blue(`\n📁 Detecting changes unique to ${targetBranch}...`));
    const changedFilesPromise: Promise<ChangedFile[]> = this.git.getChangedFiles(
      targetBranch,
      baseBranch
    );
    const changedFiles = await changedFilesPromise;
    console.log(chalk.green(`Found ${changedFiles.length} changed file(s)`));

    if (changedFiles.length === 0) {
      return this.createEmptyResult('No files changed in this PR.');
    }

    // Step 3: Chunk the changed files
    console.log(chalk.blue(`\n🔪 Chunking code using chunkyyy...`));
    const chunksPromise: Promise<CodeChunk[]> = this.chunker.chunkChangedFiles(
      changedFiles,
      targetBranch
    );
    const chunks = await chunksPromise;
    console.log(chalk.green(`Generated ${chunks.length} code chunk(s)`));

    if (chunks.length === 0) {
      return this.createEmptyResult('No code chunks could be generated from changed files.');
    }

    // Step 3.25: Filter chunks for incremental review (if enabled)
    let chunksToReview = chunks;
    if (this.reviewTracker) {
      const { chunksToReview: filteredChunks, stats: trackerStats } =
        this.reviewTracker.filterChunksForReview(chunks, targetBranch, baseBranch);

      chunksToReview = filteredChunks;

      if (trackerStats.skippedChunks > 0) {
        console.log(
          chalk.green(
            `⚡ Incremental review: Skipping ${trackerStats.skippedChunks} already-reviewed chunk(s) ` +
              `(${Math.round(trackerStats.skipRate * 100)}% reduction)`
          )
        );
      }
      if (trackerStats.newChunks > 0 || trackerStats.changedChunks > 0) {
        console.log(
          chalk.gray(
            `   ${trackerStats.newChunks} new chunk(s), ${trackerStats.changedChunks} changed chunk(s)`
          )
        );
      }
    }

    // Step 3.5: Run rule-based pre-filtering
    console.log(chalk.blue(`\n🔍 Running rule-based pre-filtering...`));
    const ruleBasedIssues = this.ruleBasedFilter.analyzeChunks(chunksToReview);
    const ruleBasedComments = this.ruleBasedFilter.convertToReviewComments(ruleBasedIssues);
    console.log(chalk.green(`Found ${ruleBasedComments.length} issue(s) via rule-based analysis`));

    // Step 4: Review code with AI (with caching and batching)
    console.log(chalk.blue(`\n🤖 Reviewing code with ${this.config.aiProvider}...`));
    console.log(
      chalk.gray(
        `Using ${chunksToReview.length} chunk(s) and ${this.config.globalRules.length} rule(s)`
      )
    );

    // Check cache first
    const cacheKey = this.reviewCache.generateCacheKey(chunksToReview);
    let reviewResult = this.reviewCache.get(cacheKey);

    if (reviewResult) {
      console.log(chalk.green('✅ Using cached review results'));
    } else {
      // Batch chunks for efficient processing
      const batches = this.chunkBatcher.batchChunks(chunksToReview);
      const batchStats = this.chunkBatcher.getBatchStats(batches);

      console.log(
        chalk.gray(
          `📦 Batched into ${batchStats.totalBatches} batch(es) ` +
            `(avg ${Math.round(batchStats.averageBatchSize)} chunks/batch)`
        )
      );

      // Review batches in parallel
      if (batches.length > 1) {
        console.log(chalk.blue(`⚡ Processing ${batches.length} batches in parallel...`));
        const reviewBatchesPromise: Promise<ReviewResult> = this.parallelReviewer.reviewBatches(
          batches,
          this.aiProvider,
          this.config.globalRules
        );
        reviewResult = await reviewBatchesPromise;
      } else {
        // Single batch - use regular review
        const reviewCodePromise: Promise<ReviewResult> = this.aiProvider.reviewCode(
          chunksToReview,
          this.config.globalRules
        );
        reviewResult = await reviewCodePromise;
      }

      // Cache the result
      this.reviewCache.set(cacheKey, reviewResult);
      console.log(chalk.gray('💾 Cached review results for future use'));
    }

    // Step 5: Merge rule-based and AI comments
    const allComments = [...ruleBasedComments, ...reviewResult.comments];

    // Step 5.5: Deduplicate comments
    const { comments: deduplicatedComments, stats: dedupStats } =
      this.commentDeduplicator.deduplicate(allComments);
    if (dedupStats.duplicatesRemoved > 0) {
      console.log(
        chalk.gray(
          `🔗 Deduplicated ${dedupStats.duplicatesRemoved} duplicate comment(s) ` +
            `(${Math.round(dedupStats.deduplicationRate * 100)}% reduction)`
        )
      );
    }

    const mergedResult: ReviewResult = {
      ...reviewResult,
      comments: deduplicatedComments,
      stats: {
        errors: deduplicatedComments.filter((c) => c.severity === 'error').length,
        warnings: deduplicatedComments.filter((c) => c.severity === 'warning').length,
        suggestions: deduplicatedComments.filter(
          (c) => c.severity === 'suggestion' || c.severity === 'info'
        ).length,
      },
    };

    // Step 6: Display all comments
    this.displayAllComments(mergedResult);

    // Step 7: Filter comments to changed lines
    const filteredResult = this.filterAndDisplayFilteredComments(
      mergedResult,
      changedFiles,
      chunks
    );

    // Step 7: Post comments to PR
    const postCommentsPromise: Promise<void> = this.postCommentsIfEnabled(
      postComments,
      filteredResult
    );
    await postCommentsPromise;

    // Step 8: Mark chunks as reviewed (for incremental reviews)
    if (this.reviewTracker && chunksToReview.length > 0) {
      const commentsForTracking = filteredResult.comments.map((c) => ({
        file: c.file,
        line: c.line,
        body: c.body,
      }));
      this.reviewTracker.markAsReviewed(
        chunksToReview,
        commentsForTracking,
        targetBranch,
        baseBranch
      );
    }

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

    const chunksPromise: Promise<CodeChunk[]> = this.getFileChunks(
      filePath,
      branch,
      startLine,
      endLine
    );
    const chunks = await chunksPromise;
    console.log(chalk.green(`Generated ${chunks.length} code chunk(s)`));

    const reviewCodePromise: Promise<ReviewResult> = this.aiProvider.reviewCode(
      chunks,
      this.config.globalRules
    );
    const reviewResult = await reviewCodePromise;
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
      const chunkFileByRangePromise: Promise<CodeChunk> = this.chunker.chunkFileByRange(
        filePath,
        startLine,
        endLine,
        branch
      );
      const chunk = await chunkFileByRangePromise;
      return [chunk];
    }

    const chunkFilePromise: Promise<CodeChunk[]> = this.chunker.chunkFile(filePath, branch);
    return await chunkFilePromise;
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

  /**
   * Get cache statistics
   */
  getCacheStats(): ReturnType<ReviewCache['getStats']> {
    return this.reviewCache.getStats();
  }

  /**
   * Clear review cache
   */
  clearCache(): void {
    this.reviewCache.clear();
  }
}
