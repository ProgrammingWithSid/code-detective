import chalk from 'chalk';
import { AIProviderFactory, AIProviderInterface } from './ai-provider';
import {
  CodegraphAnalyzer,
  ImpactAnalysis,
  createCodegraphAnalyzer,
} from './analyzers/codegraph-analyzer';
import { FalsePositiveFilter, createFalsePositiveFilter } from './analyzers/false-positive-filter';
import { LinterIntegration, createLinterIntegration } from './analyzers/linter-integration';
import { SASTIntegration, createSASTIntegration } from './analyzers/sast-integration';
import { ToolChecker } from './analyzers/tool-checker';
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
import { CommentPrioritizer, PrioritizedComment } from './utils/comment-prioritizer';
import { NamingAnalyzer } from './utils/naming-analyzer';
import { ParallelReviewer } from './utils/parallel-reviewer';
import { PRTitleAnalyzer } from './utils/pr-title-analyzer';
import { ReviewCache } from './utils/review-cache';
import { ReviewQualityScorer } from './utils/review-quality';
import { ReviewStream, ReviewStreamCallbacks } from './utils/review-stream';
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
    namingSuggestions: result.namingSuggestions?.map((n) => ({
      file: n.file,
      line: n.line,
      currentName: n.currentName,
      suggestedName: n.suggestedName,
      type: n.type,
      reason: n.reason,
      severity: n.severity,
    })),
    prTitleSuggestion: result.prTitleSuggestion
      ? {
          currentTitle: result.prTitleSuggestion.currentTitle,
          suggestedTitle: result.prTitleSuggestion.suggestedTitle,
          reason: result.prTitleSuggestion.reason,
          alternatives: result.prTitleSuggestion.alternatives,
        }
      : undefined,
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
  private commentPrioritizer: CommentPrioritizer;
  private reviewQualityScorer: ReviewQualityScorer;
  private reviewTracker?: ReviewTracker;
  private namingAnalyzer: NamingAnalyzer;
  private prTitleAnalyzer: PRTitleAnalyzer;
  private linterIntegration?: LinterIntegration;
  private sastIntegration?: SASTIntegration;
  private codegraphAnalyzer?: CodegraphAnalyzer;
  private falsePositiveFilter: FalsePositiveFilter;

  constructor(config: Config, repoPath?: string) {
    this.config = config;
    const resolvedRepoPath = repoPath ?? process.cwd();
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

    // Initialize comment prioritizer
    this.commentPrioritizer = new CommentPrioritizer();

    // Initialize review quality scorer
    this.reviewQualityScorer = new ReviewQualityScorer();

    // Initialize review tracker for incremental reviews (if enabled)
    if (config.incrementalReview?.enabled) {
      const incrementalReview = config.incrementalReview;
      const storagePath = String(incrementalReview.storagePath || '.sherlock-reviews');
      const maxHistorySize = Number(incrementalReview.maxHistorySize || 10000);
      this.reviewTracker = new ReviewTracker(storagePath, maxHistorySize);
    }

    // Initialize naming analyzer
    this.namingAnalyzer = new NamingAnalyzer({
      aiProvider: this.aiProvider,
      enabled: true,
    });

    // Initialize PR title analyzer
    this.prTitleAnalyzer = new PRTitleAnalyzer({
      aiProvider: this.aiProvider,
      enabled: true,
    });

    // Initialize linter integration (if enabled)
    if (config.linter?.enabled && config.linter.tools && config.linter.tools.length > 0) {
      this.linterIntegration = createLinterIntegration({
        ...config.linter,
        workingDir: resolvedRepoPath,
      });
    }

    // Initialize SAST integration (if enabled)
    if (config.sast?.enabled && config.sast.tools && config.sast.tools.length > 0) {
      this.sastIntegration = createSASTIntegration({
        ...config.sast,
        workingDir: resolvedRepoPath,
      });
    }

    // Initialize codegraph analyzer (always enabled for impact analysis)
    this.codegraphAnalyzer = createCodegraphAnalyzer({
      rootDir: resolvedRepoPath,
      maxDepth: 5,
      analyzeInternal: true,
    });

    // Initialize false positive filter
    this.falsePositiveFilter = createFalsePositiveFilter({
      minConfidence: 0.5,
      enableToolFiltering: true,
      enablePatternFiltering: true,
    });
  }

  /**
   * Review a PR by branch name
   */
  async reviewPR(
    targetBranch: string,
    postComments = true,
    baseBranchOverride?: string,
    streamCallbacks?: ReviewStreamCallbacks
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

    // Step 2.5 & 3: Run analysis steps in parallel for better performance
    console.log(chalk.blue(`\n🚀 Running analysis pipeline in parallel...`));
    const analysisStartTime = Date.now();

    // 1. Impact Analysis Promise
    const impactAnalysisPromise = this.codegraphAnalyzer
      ? (async (): Promise<ImpactAnalysis | null> => {
          try {
            const allFiles = changedFiles.map((f) => f.path);
            await this.codegraphAnalyzer!.buildGraph(allFiles);
            return this.codegraphAnalyzer!.analyzeImpact(changedFiles);
          } catch (error) {
            console.warn(
              chalk.yellow(
                `⚠️  Codegraph analysis failed: ${error instanceof Error ? error.message : String(error)}`
              )
            );
            return null;
          }
        })()
      : Promise.resolve<ImpactAnalysis | null>(null);

    // 2. Chunking Promise
    const chunksPromise = this.chunker.chunkChangedFiles(changedFiles, targetBranch);

    // 3. Linter Promise
    const linterPromise = this.runLinterParallel(changedFiles, targetBranch);

    // 4. SAST Promise
    const sastPromise = this.runSASTParallel(changedFiles, targetBranch);

    // Wait for all non-dependent analysis steps to complete
    const [impactAnalysis, chunks, linterComments, sastComments] = await Promise.all([
      impactAnalysisPromise,
      chunksPromise,
      linterPromise,
      sastPromise,
    ]);

    const analysisDuration = Date.now() - analysisStartTime;
    console.log(chalk.green(`✅ Analysis pipeline completed in ${analysisDuration}ms`));

    if (impactAnalysis) {
      console.log(
        chalk.green(
          `Impact analysis: ${impactAnalysis.affectedFiles.length} affected file(s), ` +
            `severity: ${impactAnalysis.severity}`
        )
      );

      // Assign priority scores to chunks based on impact
      chunks.forEach((chunk) => {
        const isAffected = impactAnalysis.affectedFiles.includes(chunk.file);
        const isDirect = impactAnalysis.changedFiles.includes(chunk.file);

        let score = 0;
        if (isDirect) score += 50;
        if (isAffected) score += 30;

        // Boost based on impact severity
        if (impactAnalysis.severity === 'high') score += 20;
        else if (impactAnalysis.severity === 'medium') score += 10;

        chunk.priorityScore = score;
        chunk.impactLevel = impactAnalysis.severity;
      });
    }

    console.log(chalk.green(`Generated ${chunks.length} code chunk(s)`));

    if (chunks.length === 0) {
      return this.createEmptyResult('No code chunks could be generated from changed files.');
    }

    // Step 3.5: Run rule-based pre-filtering (needs chunks)
    console.log(chalk.blue(`\n🔍 Running rule-based pre-filtering...`));
    const ruleBasedIssues = this.ruleBasedFilter.analyzeChunks(chunks);
    const ruleBasedComments = this.ruleBasedFilter.convertToReviewComments(ruleBasedIssues);
    console.log(chalk.green(`Found ${ruleBasedComments.length} issue(s) via rule-based analysis`));

    // Step 4: Review code with AI (with caching and batching)
    console.log(chalk.blue(`\n🤖 Reviewing code with ${this.config.aiProvider}...`));

    // Step 4.1: Filter chunks for incremental review (if enabled)
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
    }

    console.log(
      chalk.gray(
        `Using ${chunksToReview.length} chunk(s) and ${this.config.globalRules.length} rule(s)`
      )
    );

    // Step 4.2: Multi-Pass Review - Scout Pass
    console.log(chalk.blue(`\n🔍 Running Scout Pass to identify complexity hotspots...`));
    const { complexityScore, criticalFiles } = await this.aiProvider.scoutReview(chunksToReview);
    console.log(
      chalk.green(
        `Scout finding: Complexity Score ${complexityScore}/10, ` +
          `${criticalFiles.length} critical file(s) identified.`
      )
    );

    // Filter or prioritize critical files if needed
    if (complexityScore > 7) {
      console.log(chalk.yellow('⚠️  High complexity detected. Escalating analysis depth.'));
    }

    // Check cache first
    const cacheKey = this.reviewCache.generateCacheKey(chunksToReview);
    let reviewResult: ReviewResult | undefined = this.reviewCache.get(cacheKey) || undefined;

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

      // Initialize streaming if callbacks provided
      const stream = streamCallbacks ? new ReviewStream(streamCallbacks) : undefined;
      if (stream) {
        stream.start(batches.length);
      }

      // Review batches in parallel
      if (batches.length > 1) {
        const batchCount = batches.length;
        let concurrency = this.config.parallel?.concurrency || 3;

        // Adaptive concurrency: scale based on batch volume
        if (batchCount > 10) {
          concurrency = Math.min(concurrency * 2, 6);
          console.log(chalk.gray(`🚀 High volume detected: scaling concurrency to ${concurrency}`));
        }

        console.log(chalk.blue(`⚡ Processing ${batches.length} batches in parallel...`));
        reviewResult = await this.parallelReviewer.reviewBatches(
          batches,
          this.aiProvider,
          this.config.globalRules,
          stream,
          criticalFiles
        );
      } else if (chunksToReview.length > 0) {
        // Single batch - use regular review
        reviewResult = await this.aiProvider.reviewCode(chunksToReview, this.config.globalRules);
        if (stream) {
          reviewResult.comments.forEach((comment) => stream.emitComment(comment));
          stream.batchComplete(0, reviewResult.comments, batches.length);
          stream.complete(reviewResult);
        }
      } else {
        reviewResult = this.createEmptyResult('No chunks to review.');
      }

      // Cache the result
      if (reviewResult) {
        this.reviewCache.set(cacheKey, reviewResult);
        console.log(chalk.gray('💾 Cached review results for future use'));
      }
    }

    if (!reviewResult) {
      throw new Error('Review result is null');
    }

    // Step 5: Merge rule-based, linter, SAST, and AI comments
    const allComments: ReviewComment[] = [
      ...ruleBasedComments,
      ...linterComments,
      ...sastComments,
      ...reviewResult.comments,
    ];

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

    // Step 5.5: Prioritize comments (critical issues first)
    const prioritizedComments = this.commentPrioritizer.prioritizeComments(deduplicatedComments);
    const qualityMetrics = this.reviewQualityScorer.calculateQualityMetrics(
      {
        ...reviewResult,
        comments: deduplicatedComments,
      },
      chunks.length,
      chunksToReview.length
    );

    const mergedResult: ReviewResult = {
      ...reviewResult,
      comments: prioritizedComments.map((c: PrioritizedComment) => ({
        file: c.file,
        line: c.line,
        body: c.body,
        severity: c.severity,
        rule: c.rule,
        category: c.category,
        fix: c.fix,
        tool: c.tool,
      })),
      stats: this.calculateStats(deduplicatedComments),
      qualityMetrics,
    };

    // Step 6: Filter and Display
    this.displayAllComments(mergedResult);
    const filteredResult = this.filterAndDisplayFilteredComments(
      mergedResult,
      changedFiles,
      chunks
    );

    // Step 7: Analyze naming and PR title
    console.log(chalk.blue(`\n📝 Analyzing naming conventions and PR title...`));
    const [namingSuggestions, prTitleSuggestion] = await Promise.all([
      this.namingAnalyzer.analyzeNaming(chunks),
      this.prTitleAnalyzer.analyzePRTitle(undefined, changedFiles, chunks),
    ]);

    const finalResult: ReviewResult = {
      ...filteredResult,
      namingSuggestions: namingSuggestions.length > 0 ? namingSuggestions : undefined,
      prTitleSuggestion: prTitleSuggestion || undefined,
    };

    // Step 8: Post comments
    await this.postCommentsIfEnabled(postComments, finalResult);
    if (postComments && this.config.pr?.number) {
      await this.postReviewDecision(finalResult, this.config.pr.number);
    }

    // Step 9: Mark as reviewed
    if (this.reviewTracker && chunksToReview.length > 0) {
      this.reviewTracker.markAsReviewed(
        chunksToReview,
        filteredResult.comments.map((c) => ({ file: c.file, line: c.line, body: c.body })),
        targetBranch,
        baseBranch
      );
    }

    return finalResult;
  }

  /**
   * Review a specific file
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

    // Group by priority for display
    const prioritized = this.commentPrioritizer.prioritizeComments(result.comments);
    const groups = this.commentPrioritizer.groupByPriority(prioritized);

    let displayIndex = 1;

    // Display critical issues first
    if (groups.critical.length > 0) {
      console.log(chalk.red(`\n🚨 Critical Issues (${groups.critical.length}):`));
      groups.critical.forEach((comment) => {
        const displayComment: ReviewComment = {
          file: comment.file,
          line: comment.line,
          body: comment.body,
          severity: comment.severity,
          rule: comment.rule,
          category: comment.category,
          fix: comment.fix,
          tool: comment.tool,
        };
        this.displayComment(displayComment, displayIndex++);
      });
    }

    // Then high priority
    if (groups.high.length > 0) {
      console.log(chalk.yellow(`\n⚠️  High Priority (${groups.high.length}):`));
      groups.high.forEach((comment) => {
        const displayComment: ReviewComment = {
          file: comment.file,
          line: comment.line,
          body: comment.body,
          severity: comment.severity,
          rule: comment.rule,
          category: comment.category,
          fix: comment.fix,
          tool: comment.tool,
        };
        this.displayComment(displayComment, displayIndex++);
      });
    }

    // Then medium and low (if any)
    const remaining = [...groups.medium, ...groups.low];
    if (remaining.length > 0) {
      console.log(chalk.gray(`\n💡 Other Issues (${remaining.length}):`));
      remaining.forEach((comment) => {
        const displayComment: ReviewComment = {
          file: comment.file,
          line: comment.line,
          body: comment.body,
          severity: comment.severity,
          rule: comment.rule,
          category: comment.category,
          fix: comment.fix,
          tool: comment.tool,
        };
        this.displayComment(displayComment, displayIndex++);
      });
    }
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

  protected filterAndDisplayFilteredComments(
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

  private calculateStats(comments: ReviewComment[]): ReviewStats {
    return {
      errors: comments.filter((c) => c.severity === 'error').length,
      warnings: comments.filter((c) => c.severity === 'warning').length,
      suggestions: comments.filter((c) => c.severity === 'suggestion' || c.severity === 'info')
        .length,
    };
  }

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

  private async getFileChunks(
    filePath: string,
    branch: string,
    startLine?: number,
    endLine?: number
  ): Promise<CodeChunk[]> {
    if (startLine !== undefined && endLine !== undefined) {
      console.log(chalk.blue(`Using range ${startLine}-${endLine}`));
      return [await this.chunker.chunkFileByRange(filePath, startLine, endLine, branch)];
    }

    return await this.chunker.chunkFile(filePath, branch);
  }

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

    // Post suggestions (PR title and naming)
    await this.prCommentService.postSuggestions(result, prNumber);
    if (result.namingSuggestions?.length || result.prTitleSuggestion) {
      console.log(chalk.green('Posted suggestions'));
    }

    // Post review decision (CodeRabbit-like feature)
    await this.postReviewDecision(result, prNumber);
  }

  private async postReviewDecision(result: ReviewResult, prNumber: number): Promise<void> {
    try {
      // Determine decision based on review results
      const errors = result.comments.filter((c) => c.severity === 'error');
      const warnings = result.comments.filter((c) => c.severity === 'warning');

      let decision: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      if (errors.length > 0 || warnings.length > 3) {
        decision = 'REQUEST_CHANGES';
      } else if (warnings.length > 0 || result.comments.length > 0) {
        decision = 'COMMENT';
      } else {
        decision = 'APPROVE';
      }

      await this.prCommentService.postReviewDecision(result, prNumber, decision);
      console.log(chalk.green(`Posted review decision: ${decision}`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(chalk.yellow(`Failed to post review decision: ${errorMessage}`));
    }
  }

  /**
   * Run linter analysis in parallel
   */
  private async runLinterParallel(
    changedFiles: ChangedFile[],
    targetBranch: string
  ): Promise<ReviewComment[]> {
    if (
      !this.linterIntegration ||
      !this.config.linter?.enabled ||
      !this.config.linter.tools ||
      this.config.linter.tools.length === 0
    ) {
      return [];
    }

    try {
      const toolCheck = await ToolChecker.checkLinterTools(this.config.linter.tools);
      if (!toolCheck.allAvailable && toolCheck.missing.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Some linter tools are not available:`));
        console.log(chalk.gray(ToolChecker.formatCheckResults(toolCheck)));
      }

      console.log(chalk.blue(`\n🔧 Running linters...`));
      const fileContents = await Promise.all(
        changedFiles.map(async (file) => {
          const content = await this.git.getFileContent(file.path, targetBranch);
          return { path: file.path, content };
        })
      );

      const linterResult = await this.linterIntegration.analyze(fileContents);
      const rawComments = this.linterIntegration.convertToReviewComments(linterResult);

      const { filtered: filteredComments, stats: filterStats } =
        this.falsePositiveFilter.filterReviewComments(rawComments);

      console.log(
        chalk.green(
          `Found ${linterResult.summary.errors} error(s), ${linterResult.summary.warnings} warning(s), ${linterResult.summary.suggestions} suggestion(s) via linters`
        )
      );
      if (filterStats.filteredIssues > 0) {
        console.log(
          chalk.gray(
            `   Filtered ${filterStats.filteredIssues} false positive(s) ` +
              `(${Math.round(filterStats.filterRate * 100)}% reduction)`
          )
        );
      }

      return filteredComments;
    } catch (error) {
      console.warn(
        chalk.yellow(
          `⚠️  Linter analysis failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      return [];
    }
  }

  /**
   * Run SAST analysis in parallel
   */
  private async runSASTParallel(
    changedFiles: ChangedFile[],
    targetBranch: string
  ): Promise<ReviewComment[]> {
    if (
      !this.sastIntegration ||
      !this.config.sast?.enabled ||
      !this.config.sast.tools ||
      this.config.sast.tools.length === 0
    ) {
      return [];
    }

    try {
      const toolCheck = await ToolChecker.checkSASTTools(this.config.sast.tools);
      if (!toolCheck.allAvailable && toolCheck.missing.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Some SAST tools are not available:`));
        console.log(chalk.gray(ToolChecker.formatCheckResults(toolCheck)));
      }

      console.log(chalk.blue(`\n🔒 Running SAST security analysis...`));
      const fileContents = await Promise.all(
        changedFiles.map(async (file) => {
          const content = await this.git.getFileContent(file.path, targetBranch);
          return { path: file.path, content };
        })
      );

      const sastResult = await this.sastIntegration.analyze(fileContents);
      const rawComments = this.sastIntegration.convertToReviewComments(sastResult);

      const { filtered: filteredComments, stats: filterStats } =
        this.falsePositiveFilter.filterReviewComments(rawComments);

      console.log(
        chalk.green(
          `Found ${sastResult.summary.critical} critical, ${sastResult.summary.high} high, ${sastResult.summary.medium} medium, ${sastResult.summary.low} low severity issue(s) via SAST tools`
        )
      );
      if (filterStats.filteredIssues > 0) {
        console.log(
          chalk.gray(
            `   Filtered ${filterStats.filteredIssues} false positive(s) ` +
              `(${Math.round(filterStats.filterRate * 100)}% reduction)`
          )
        );
      }

      return filteredComments;
    } catch (error) {
      console.warn(
        chalk.yellow(
          `⚠️  SAST analysis failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      return [];
    }
  }

  getCacheStats(): ReturnType<ReviewCache['getStats']> {
    return this.reviewCache.getStats();
  }

  clearCache(): void {
    this.reviewCache.clear();
  }
}
