/**
 * False Positive Filter - Reduces noise from linters and SAST tools
 *
 * Features:
 * - Confidence-based filtering
 * - Pattern-based filtering
 * - Historical learning (future enhancement)
 * - Tool-specific filtering rules
 */

import { ReviewComment } from '../types';
import { LinterIssue } from './linter-integration';
import { SASTIssue } from './sast-integration';

// ============================================================================
// Types
// ============================================================================

export interface FalsePositivePattern {
  /** Pattern to match */
  pattern: RegExp | string;
  /** Tool this applies to */
  tool?: string;
  /** File pattern */
  filePattern?: RegExp | string;
  /** Reason for filtering */
  reason: string;
  /** Confidence threshold */
  confidenceThreshold?: number;
}

export interface FilterStats {
  totalIssues: number;
  filteredIssues: number;
  remainingIssues: number;
  filterRate: number;
  byTool: Record<string, { filtered: number; total: number }>;
}

export interface FalsePositiveFilterOptions {
  /** Minimum confidence to keep issue */
  minConfidence?: number;
  /** Custom patterns to filter */
  customPatterns?: FalsePositivePattern[];
  /** Enable tool-specific filtering */
  enableToolFiltering?: boolean;
  /** Enable pattern-based filtering */
  enablePatternFiltering?: boolean;
  /** Files/patterns to always filter */
  alwaysFilterPatterns?: string[];
}

// ============================================================================
// Default False Positive Patterns
// ============================================================================

const DEFAULT_FALSE_POSITIVE_PATTERNS: FalsePositivePattern[] = [
  // Common false positives
  {
    pattern: /prefer.*const/i,
    reason: 'Style preference, not a bug',
    confidenceThreshold: 0.6,
  },
  {
    pattern: /convert.*to.*const/i,
    filePattern: /\.go$/,
    reason: 'Illegal const in Go for complex types',
    confidenceThreshold: 0.9,
  },
  {
    pattern: /convert.*to.*const/i,
    filePattern: /\.java$/,
    reason: 'Final/const confusion in Java',
    confidenceThreshold: 0.7,
  },
  {
    pattern: /line.*too.*long/i,
    reason: 'Formatting issue, not critical',
    confidenceThreshold: 0.3,
  },
  {
    pattern: /missing.*docstring/i,
    reason: 'Documentation preference',
    confidenceThreshold: 0.4,
  },
  {
    pattern: /unused.*variable/i,
    reason: 'May be intentional',
    confidenceThreshold: 0.5,
  },
  {
    pattern: /complexity.*too.*high/i,
    reason: 'Subjective metric',
    confidenceThreshold: 0.6,
  },
  // ESLint common false positives
  {
    pattern: /no-console/i,
    tool: 'eslint',
    reason: 'Console statements often intentional in development',
    confidenceThreshold: 0.4,
  },
  {
    pattern: /@typescript-eslint\/no-explicit-any/i,
    tool: 'eslint',
    reason: 'Any type may be intentional',
    confidenceThreshold: 0.5,
  },
  // Prettier false positives
  {
    pattern: /prettier/i,
    tool: 'prettier',
    reason: 'Formatting only, auto-fixable',
    confidenceThreshold: 0.2,
  },
  // Security scanner false positives
  {
    pattern: /hardcoded.*password/i,
    tool: 'semgrep',
    reason: 'May be test data or placeholders',
    confidenceThreshold: 0.6,
  },
  {
    pattern: /insecure.*random/i,
    tool: 'bandit',
    reason: 'May be acceptable for non-cryptographic use',
    confidenceThreshold: 0.7,
  },
  // Rust specific false positives
  {
    pattern: /avoid.*unwrap/i,
    filePattern: /(test|spec)/i,
    reason: 'Unwrap is acceptable in tests',
    confidenceThreshold: 0.8,
  },
];

// ============================================================================
// False Positive Filter Class
// ============================================================================

export class FalsePositiveFilter {
  private options: FalsePositiveFilterOptions;
  private patterns: FalsePositivePattern[];

  constructor(options: FalsePositiveFilterOptions = {}) {
    this.options = {
      minConfidence: 0.5,
      enableToolFiltering: true,
      enablePatternFiltering: true,
      alwaysFilterPatterns: [],
      ...options,
    };

    this.patterns = [...DEFAULT_FALSE_POSITIVE_PATTERNS, ...(options.customPatterns || [])];
  }

  /**
   * Filter linter issues
   */
  filterLinterIssues(issues: LinterIssue[]): {
    filtered: LinterIssue[];
    stats: FilterStats;
  } {
    const stats: FilterStats = {
      totalIssues: issues.length,
      filteredIssues: 0,
      remainingIssues: 0,
      filterRate: 0,
      byTool: {},
    };

    const filtered: LinterIssue[] = [];

    for (const issue of issues) {
      // Track by tool
      if (!stats.byTool[issue.tool]) {
        stats.byTool[issue.tool] = { filtered: 0, total: 0 };
      }
      const toolStats = stats.byTool[issue.tool]!; // Non-null assertion: we just set it above
      toolStats.total++;

      // Check if should filter
      if (this.shouldFilterLinterIssue(issue)) {
        toolStats.filtered++;
        stats.filteredIssues++;
        continue;
      }

      filtered.push(issue);
    }

    stats.remainingIssues = filtered.length;
    stats.filterRate = stats.totalIssues > 0 ? stats.filteredIssues / stats.totalIssues : 0;

    return { filtered, stats };
  }

  /**
   * Filter SAST issues
   */
  filterSASTIssues(issues: SASTIssue[]): {
    filtered: SASTIssue[];
    stats: FilterStats;
  } {
    const stats: FilterStats = {
      totalIssues: issues.length,
      filteredIssues: 0,
      remainingIssues: 0,
      filterRate: 0,
      byTool: {},
    };

    const filtered: SASTIssue[] = [];

    for (const issue of issues) {
      // Track by tool
      if (!stats.byTool[issue.tool]) {
        stats.byTool[issue.tool] = { filtered: 0, total: 0 };
      }
      const toolStats = stats.byTool[issue.tool]!; // Non-null assertion: we just set it above
      toolStats.total++;

      // Check if should filter
      if (this.shouldFilterSASTIssue(issue)) {
        toolStats.filtered++;
        stats.filteredIssues++;
        continue;
      }

      filtered.push(issue);
    }

    stats.remainingIssues = filtered.length;
    stats.filterRate = stats.totalIssues > 0 ? stats.filteredIssues / stats.totalIssues : 0;

    return { filtered, stats };
  }

  /**
   * Filter review comments
   */
  filterReviewComments(comments: ReviewComment[]): {
    filtered: ReviewComment[];
    stats: FilterStats;
  } {
    const stats: FilterStats = {
      totalIssues: comments.length,
      filteredIssues: 0,
      remainingIssues: 0,
      filterRate: 0,
      byTool: {},
    };

    const filtered: ReviewComment[] = [];

    for (const comment of comments) {
      // Track by category/tool
      const tool = comment.category || 'unknown';
      if (!stats.byTool[tool]) {
        stats.byTool[tool] = { filtered: 0, total: 0 };
      }
      stats.byTool[tool].total++;

      // Check if should filter
      if (this.shouldFilterReviewComment(comment)) {
        stats.byTool[tool].filtered++;
        stats.filteredIssues++;
        continue;
      }

      filtered.push(comment);
    }

    stats.remainingIssues = filtered.length;
    stats.filterRate = stats.totalIssues > 0 ? stats.filteredIssues / stats.totalIssues : 0;

    return { filtered, stats };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Check if linter issue should be filtered
   */
  private shouldFilterLinterIssue(issue: LinterIssue): boolean {
    // Always filter if in alwaysFilterPatterns
    if (this.shouldAlwaysFilter(issue.file)) {
      return true;
    }

    // Filter by confidence if enabled
    if (this.options.enableToolFiltering) {
      const confidence = this.calculateConfidence(issue);
      if (confidence < (this.options.minConfidence || 0.5)) {
        return true;
      }
    }

    // Filter by pattern if enabled
    if (this.options.enablePatternFiltering) {
      if (this.matchesFalsePositivePattern(issue, issue.tool)) {
        return true;
      }
    }

    // Never filter errors
    if (issue.severity === 'error') {
      return false;
    }

    return false;
  }

  /**
   * Check if SAST issue should be filtered
   */
  private shouldFilterSASTIssue(issue: SASTIssue): boolean {
    // Always filter if in alwaysFilterPatterns
    if (this.shouldAlwaysFilter(issue.file)) {
      return true;
    }

    // Filter by confidence
    const confidenceMap: Record<string, number> = {
      high: 0.9,
      medium: 0.7,
      low: 0.5,
    };
    const confidence = confidenceMap[issue.confidence] || 0.5;

    if (confidence < (this.options.minConfidence || 0.5)) {
      return true;
    }

    // Filter by pattern if enabled
    if (this.options.enablePatternFiltering) {
      if (this.matchesFalsePositivePattern(issue, issue.tool)) {
        return true;
      }
    }

    // Never filter high-confidence errors
    if (issue.severity === 'error' && issue.confidence === 'high') {
      return false;
    }

    return false;
  }

  /**
   * Check if review comment should be filtered
   */
  private shouldFilterReviewComment(comment: ReviewComment): boolean {
    // Always filter if in alwaysFilterPatterns
    if (this.shouldAlwaysFilter(comment.file)) {
      return true;
    }

    // Never filter errors
    if (comment.severity === 'error') {
      return false;
    }

    // Filter warnings/suggestions/info that match false positive patterns
    if (
      comment.severity === 'warning' ||
      comment.severity === 'suggestion' ||
      comment.severity === 'info'
    ) {
      // Filter if matches common false positive patterns
      if (
        this.matchesFalsePositivePattern(
          { message: comment.body, file: comment.file },
          comment.tool || comment.category
        )
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file should always be filtered
   */
  private shouldAlwaysFilter(file: string): boolean {
    const patterns = this.options.alwaysFilterPatterns || [];
    return patterns.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file);
      }
      return file.includes(pattern);
    });
  }

  /**
   * Calculate confidence for linter issue
   */
  private calculateConfidence(issue: LinterIssue): number {
    let confidence = 0.7; // Base confidence

    // Higher confidence for errors
    if (issue.severity === 'error') {
      confidence = 0.9;
    } else if (issue.severity === 'warning') {
      confidence = 0.7;
    } else {
      confidence = 0.5;
    }

    // Lower confidence for auto-fixable issues (often style issues)
    if (issue.fix && issue.fix.includes('auto')) {
      confidence *= 0.7;
    }

    // Lower confidence for certain tools
    const lowConfidenceTools = ['prettier', 'isort', 'black', 'gofmt', 'rustfmt'];
    if (lowConfidenceTools.includes(issue.tool)) {
      confidence *= 0.6;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Check if issue matches false positive pattern
   */
  private matchesFalsePositivePattern(
    issue: { message: string; file: string },
    tool?: string
  ): boolean {
    for (const pattern of this.patterns) {
      // Check tool match
      if (pattern.tool && tool && pattern.tool !== tool) {
        continue;
      }

      // Check file pattern
      if (pattern.filePattern) {
        const fileRegex =
          pattern.filePattern instanceof RegExp
            ? pattern.filePattern
            : new RegExp(pattern.filePattern);
        if (!fileRegex.test(issue.file)) {
          continue;
        }
      }

      // Check message pattern
      const messageRegex =
        pattern.pattern instanceof RegExp ? pattern.pattern : new RegExp(pattern.pattern, 'i');
      if (messageRegex.test(issue.message)) {
        return true;
      }
    }

    return false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFalsePositiveFilter(
  options?: FalsePositiveFilterOptions
): FalsePositiveFilter {
  return new FalsePositiveFilter(options);
}
