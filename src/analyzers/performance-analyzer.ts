/**
 * Performance Analyzer - Detects performance issues in code
 *
 * Detects:
 * - N+1 queries
 * - Memory leaks
 * - Inefficient loops
 * - Large bundle imports
 * - Missing memoization
 * - Blocking operations
 * - Unoptimized renders
 */

import { Severity } from '../types';

// ============================================================================
// Types
// ============================================================================

export type PerformanceIssueType =
  | 'n-plus-one'
  | 'memory-leak'
  | 'inefficient-loop'
  | 'large-import'
  | 'missing-memoization'
  | 'blocking-operation'
  | 'unoptimized-render'
  | 'excessive-re-render'
  | 'missing-index'
  | 'unbounded-query'
  | 'sync-io'
  | 'inefficient-regex'
  | 'array-mutation'
  | 'missing-cleanup'
  | 'other';

export interface PerformanceIssue {
  /** Issue type */
  type: PerformanceIssueType;
  /** Severity level */
  severity: Severity;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Issue message */
  message: string;
  /** Detailed description */
  description: string;
  /** Impact assessment */
  impact: 'high' | 'medium' | 'low';
  /** Suggested fix */
  suggestion?: string;
  /** Code snippet */
  snippet?: string;
  /** Estimated performance gain */
  estimatedGain?: string;
  /** Category (frontend/backend/both) */
  category: 'frontend' | 'backend' | 'both';
}

export interface PerformanceAnalysisResult {
  /** Found issues */
  issues: PerformanceIssue[];
  /** Files analyzed */
  filesAnalyzed: number;
  /** Analysis time (ms) */
  analysisTime: number;
  /** Summary by impact */
  summary: {
    high: number;
    medium: number;
    low: number;
  };
  /** Summary by type */
  byType: Record<PerformanceIssueType, number>;
  /** Overall score (0-100) */
  score: number;
}

export interface PerformanceAnalyzerOptions {
  /** Issue types to check */
  enabledChecks?: PerformanceIssueType[];
  /** Minimum impact to report */
  minImpact?: 'high' | 'medium' | 'low';
  /** Custom patterns to detect */
  customPatterns?: PerformancePattern[];
  /** Focus on frontend, backend, or both */
  focus?: 'frontend' | 'backend' | 'both';
}

export interface PerformancePattern {
  /** Pattern name */
  name: string;
  /** Issue type */
  type: PerformanceIssueType;
  /** Pattern to match */
  pattern: RegExp;
  /** Languages this applies to */
  languages: string[];
  /** Severity */
  severity: Severity;
  /** Impact */
  impact: 'high' | 'medium' | 'low';
  /** Message template */
  message: string;
  /** Category */
  category: 'frontend' | 'backend' | 'both';
}

// ============================================================================
// Default Performance Patterns
// ============================================================================

const DEFAULT_PERFORMANCE_PATTERNS: PerformancePattern[] = [
  // N+1 Queries
  {
    name: 'loop-query',
    type: 'n-plus-one',
    pattern: /for\s*\([^)]*\)\s*\{[^}]*(?:await|\.then)\s*[^}]*(?:find|query|select|fetch)/gis,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'high',
    message: 'Potential N+1 query - database query inside loop',
    category: 'backend',
  },
  {
    name: 'foreach-await',
    type: 'n-plus-one',
    pattern: /\.forEach\s*\(\s*async/g,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'high',
    message: 'Async operation in forEach - consider using Promise.all with map',
    category: 'both',
  },

  // Memory Leaks
  {
    name: 'missing-removelistener',
    type: 'memory-leak',
    pattern: /addEventListener\s*\([^)]+\)(?![^}]*removeEventListener)/gs,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'medium',
    message: 'Event listener added without corresponding cleanup',
    category: 'frontend',
  },
  {
    name: 'missing-unsubscribe',
    type: 'missing-cleanup',
    pattern: /\.subscribe\s*\([^)]+\)(?![^}]*\.unsubscribe)/gs,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'medium',
    message: 'Subscription without cleanup - potential memory leak',
    category: 'both',
  },
  {
    name: 'setinterval-no-clear',
    type: 'memory-leak',
    pattern: /setInterval\s*\([^)]+\)(?![^}]*clearInterval)/gs,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'high',
    message: 'setInterval without clearInterval - memory leak risk',
    category: 'both',
  },

  // Inefficient Loops
  {
    name: 'array-length-in-loop',
    type: 'inefficient-loop',
    pattern: /for\s*\(\s*(?:let|var)\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+\.length\s*;/g,
    languages: ['typescript', 'javascript'],
    severity: 'info',
    impact: 'low',
    message: 'Consider caching array length in loop for better performance',
    category: 'both',
  },
  {
    name: 'nested-loop-includes',
    type: 'inefficient-loop',
    pattern: /for[^{]*\{[^}]*for[^{]*\{[^}]*\.includes\s*\(/gs,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'high',
    message: 'Nested loop with array.includes() - O(n²) complexity. Consider using Set',
    category: 'both',
  },
  {
    name: 'filter-find-chain',
    type: 'inefficient-loop',
    pattern: /\.filter\s*\([^)]+\)\s*\.find\s*\(/g,
    languages: ['typescript', 'javascript'],
    severity: 'info',
    impact: 'low',
    message: 'filter().find() can be replaced with single find()',
    category: 'both',
  },

  // Large Imports
  {
    name: 'full-lodash-import',
    type: 'large-import',
    pattern: /import\s+(?:\*\s+as\s+)?(?:_|lodash)\s+from\s+['"]lodash['"]/g,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'medium',
    message: 'Full lodash import - use lodash-es or specific imports to reduce bundle size',
    category: 'frontend',
  },
  {
    name: 'moment-import',
    type: 'large-import',
    pattern: /import\s+(?:\w+\s+)?from\s+['"]moment['"]/g,
    languages: ['typescript', 'javascript'],
    severity: 'info',
    impact: 'medium',
    message: 'Moment.js is large - consider date-fns or dayjs for smaller bundle',
    category: 'frontend',
  },
  {
    name: 'full-icon-import',
    type: 'large-import',
    pattern: /import\s+\{[^}]{100,}\}\s+from\s+['"]@?(?:heroicons|feather|lucide)/g,
    languages: ['typescript', 'javascript'],
    severity: 'info',
    impact: 'low',
    message: 'Many icon imports - consider dynamic imports for better tree-shaking',
    category: 'frontend',
  },

  // React-specific
  {
    name: 'missing-usememo',
    type: 'missing-memoization',
    pattern:
      /(?:const|let)\s+\w+\s*=\s*(?:\[[\s\S]*?\]|\{[\s\S]*?\})(?:\s*;)?\s*\n\s*(?:return|<)/gm,
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    severity: 'info',
    impact: 'low',
    message: 'Object/array literal in render - consider useMemo to prevent unnecessary re-renders',
    category: 'frontend',
  },
  {
    name: 'inline-function-prop',
    type: 'excessive-re-render',
    pattern: /<\w+[^>]*\s(?:on\w+|handler|callback)\s*=\s*\{[^}]*=>/g,
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    severity: 'info',
    impact: 'low',
    message: 'Inline function in JSX prop - consider useCallback for better performance',
    category: 'frontend',
  },
  {
    name: 'missing-key-prop',
    type: 'unoptimized-render',
    pattern:
      /\.map\s*\([^)]*\)\s*(?:\.\s*(?:filter|map|slice))?\s*(?:=>|{)[^}]*<(?!Fragment)[A-Z]\w*[^>]*(?!key\s*=)/gs,
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    severity: 'warning',
    impact: 'medium',
    message: 'Missing key prop in mapped component - React needs keys for reconciliation',
    category: 'frontend',
  },

  // Blocking Operations
  {
    name: 'sync-fs',
    type: 'sync-io',
    pattern: /(?:readFileSync|writeFileSync|existsSync|readdirSync|statSync|mkdirSync)/g,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'high',
    message: 'Synchronous file operation - consider using async version',
    category: 'backend',
  },
  {
    name: 'sync-crypto',
    type: 'blocking-operation',
    pattern: /crypto\.(?:pbkdf2Sync|scryptSync|randomBytes)\s*\(/g,
    languages: ['typescript', 'javascript'],
    severity: 'info',
    impact: 'medium',
    message: 'Synchronous crypto operation - may block event loop with large inputs',
    category: 'backend',
  },

  // Inefficient Regex
  {
    name: 'catastrophic-backtracking',
    type: 'inefficient-regex',
    pattern: /new RegExp\([^)]*(?:\+\*|\*\+|\.\*\.\*)/g,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'high',
    message: 'Potential catastrophic regex backtracking',
    category: 'both',
  },
  {
    name: 'regex-in-loop',
    type: 'inefficient-regex',
    pattern: /for[^{]*\{[^}]*new RegExp\s*\(/gs,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'medium',
    message: 'RegExp created inside loop - move to outside for better performance',
    category: 'both',
  },

  // Array Mutations
  {
    name: 'push-in-reduce',
    type: 'array-mutation',
    pattern: /\.reduce\s*\([^)]*\)\s*(?:=>|{)[^}]*\.push\s*\(/gs,
    languages: ['typescript', 'javascript'],
    severity: 'info',
    impact: 'low',
    message: 'Array.push in reduce - consider spread operator for immutability',
    category: 'both',
  },

  // Unbounded Queries
  {
    name: 'query-no-limit',
    type: 'unbounded-query',
    pattern: /\.find\s*\(\s*\{[^}]*\}\s*\)(?!\.(?:limit|take|first|findOne))/g,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    impact: 'high',
    message: 'Database query without limit - may return excessive results',
    category: 'backend',
  },
];

// ============================================================================
// Performance Analyzer Class
// ============================================================================

export class PerformanceAnalyzer {
  private options: PerformanceAnalyzerOptions;
  private patterns: PerformancePattern[];

  constructor(options: PerformanceAnalyzerOptions = {}) {
    this.options = {
      focus: 'both',
      ...options,
    };

    this.patterns = [...DEFAULT_PERFORMANCE_PATTERNS, ...(options.customPatterns || [])];

    // Filter by enabled checks
    if (options.enabledChecks) {
      this.patterns = this.patterns.filter((p) => options.enabledChecks!.includes(p.type));
    }

    // Filter by focus
    if (options.focus && options.focus !== 'both') {
      this.patterns = this.patterns.filter(
        (p) => p.category === options.focus || p.category === 'both'
      );
    }
  }

  /**
   * Analyze files for performance issues
   */
  analyze(files: Array<{ path: string; content: string }>): PerformanceAnalysisResult {
    const startTime = Date.now();
    const issues: PerformanceIssue[] = [];
    const byType: Record<PerformanceIssueType, number> = {} as Record<PerformanceIssueType, number>;

    for (const file of files) {
      const language = this.detectLanguage(file.path);
      const fileIssues = this.analyzeFile(file.path, file.content, language);
      issues.push(...fileIssues);
    }

    // Filter by minimum impact
    const filteredIssues = this.filterByImpact(issues);

    // Calculate summary
    for (const issue of filteredIssues) {
      byType[issue.type] = (byType[issue.type] || 0) + 1;
    }

    // Calculate score
    const score = this.calculateScore(filteredIssues);

    return {
      issues: filteredIssues,
      filesAnalyzed: files.length,
      analysisTime: Date.now() - startTime,
      summary: {
        high: filteredIssues.filter((i) => i.impact === 'high').length,
        medium: filteredIssues.filter((i) => i.impact === 'medium').length,
        low: filteredIssues.filter((i) => i.impact === 'low').length,
      },
      byType,
      score,
    };
  }

  /**
   * Analyze a single file
   */
  private analyzeFile(path: string, content: string, language: string): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    const lines = content.split('\n');

    for (const pattern of this.patterns) {
      // Check if pattern applies to this language
      if (!pattern.languages.includes(language)) continue;

      // Find matches
      let match;
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);

      while ((match = regex.exec(content)) !== null) {
        const lineNumber = this.getLineNumber(content, match.index);
        const snippet = lines[lineNumber - 1] || '';

        issues.push({
          type: pattern.type,
          severity: pattern.severity,
          file: path,
          line: lineNumber,
          message: pattern.message,
          description: this.getDescription(pattern.type),
          impact: pattern.impact,
          suggestion: this.getSuggestion(pattern.type),
          snippet: snippet.trim(),
          estimatedGain: this.getEstimatedGain(pattern.impact),
          category: pattern.category,
        });
      }
    }

    return issues;
  }

  /**
   * Get line number from character index
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Detect language from file path
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      go: 'go',
      java: 'java',
    };
    return map[ext] || 'unknown';
  }

  /**
   * Filter issues by minimum impact
   */
  private filterByImpact(issues: PerformanceIssue[]): PerformanceIssue[] {
    if (!this.options.minImpact) return issues;

    const impactOrder = ['low', 'medium', 'high'];
    const minIndex = impactOrder.indexOf(this.options.minImpact);

    return issues.filter((issue) => impactOrder.indexOf(issue.impact) >= minIndex);
  }

  /**
   * Calculate performance score
   */
  private calculateScore(issues: PerformanceIssue[]): number {
    if (issues.length === 0) return 100;

    let deductions = 0;
    for (const issue of issues) {
      switch (issue.impact) {
        case 'high':
          deductions += 15;
          break;
        case 'medium':
          deductions += 8;
          break;
        case 'low':
          deductions += 3;
          break;
      }
    }

    return Math.max(0, 100 - deductions);
  }

  /**
   * Get description for pattern type
   */
  private getDescription(type: PerformanceIssueType): string {
    const descriptions: Record<PerformanceIssueType, string> = {
      'n-plus-one':
        'N+1 queries execute one query per item in a loop, causing significant database overhead.',
      'memory-leak':
        'Memory leaks occur when references are not properly cleaned up, causing memory usage to grow over time.',
      'inefficient-loop': 'Inefficient loops can cause unnecessary iterations or computations.',
      'large-import': 'Large imports increase bundle size and slow down initial page load.',
      'missing-memoization': 'Missing memoization causes unnecessary recalculations on re-renders.',
      'blocking-operation':
        'Blocking operations freeze the main thread, causing UI freezes or request delays.',
      'unoptimized-render': 'Unoptimized renders cause unnecessary DOM updates.',
      'excessive-re-render': 'Excessive re-renders waste CPU cycles and slow down the UI.',
      'missing-index': 'Missing database indexes cause slow queries.',
      'unbounded-query':
        'Queries without limits can return massive result sets, causing memory issues.',
      'sync-io': 'Synchronous I/O blocks the event loop, reducing throughput.',
      'inefficient-regex': 'Inefficient regex patterns can cause exponential backtracking.',
      'array-mutation': 'Array mutations can cause bugs and prevent certain optimizations.',
      'missing-cleanup': 'Missing cleanup can lead to memory leaks and stale state.',
      other: 'Performance issue detected.',
    };
    return descriptions[type] || descriptions.other;
  }

  /**
   * Get suggestion for fix
   */
  private getSuggestion(type: PerformanceIssueType): string {
    const suggestions: Record<PerformanceIssueType, string> = {
      'n-plus-one': 'Batch queries together or use eager loading/joins.',
      'memory-leak': 'Clean up event listeners, subscriptions, and timers in cleanup functions.',
      'inefficient-loop': 'Consider using more efficient data structures like Set or Map.',
      'large-import': 'Use tree-shakeable imports: import { specific } from "package".',
      'missing-memoization':
        'Wrap with useMemo() for computed values or useCallback() for functions.',
      'blocking-operation': 'Use async alternatives or move to a worker thread.',
      'unoptimized-render': 'Add key props and use React.memo() for expensive components.',
      'excessive-re-render': 'Move inline functions outside render or wrap with useCallback.',
      'missing-index': 'Add database indexes on frequently queried columns.',
      'unbounded-query': 'Add .limit() or pagination to prevent excessive results.',
      'sync-io': 'Use async/await versions: readFile instead of readFileSync.',
      'inefficient-regex': 'Simplify the regex or use possessive quantifiers where available.',
      'array-mutation': 'Use spread operator or array methods that return new arrays.',
      'missing-cleanup':
        'Return cleanup function from useEffect or unsubscribe in componentWillUnmount.',
      other: 'Review the code for potential optimizations.',
    };
    return suggestions[type] || suggestions.other;
  }

  /**
   * Get estimated performance gain
   */
  private getEstimatedGain(impact: 'high' | 'medium' | 'low'): string {
    const gains: Record<'high' | 'medium' | 'low', string> = {
      high: 'Significant improvement (50%+)',
      medium: 'Moderate improvement (20-50%)',
      low: 'Minor improvement (<20%)',
    };
    return gains[impact];
  }

  /**
   * Format results as markdown
   */
  formatAsMarkdown(result: PerformanceAnalysisResult): string {
    const lines: string[] = [];

    lines.push('# ⚡ Performance Analysis Report\n');

    // Score
    const scoreEmoji = result.score >= 80 ? '🟢' : result.score >= 60 ? '🟡' : '🔴';
    lines.push(`## Performance Score: ${scoreEmoji} ${result.score}/100\n`);

    // Summary
    lines.push('## Summary\n');
    lines.push(`| Impact | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| 🔴 High | ${result.summary.high} |`);
    lines.push(`| 🟡 Medium | ${result.summary.medium} |`);
    lines.push(`| 🟢 Low | ${result.summary.low} |`);
    lines.push(`| **Total** | **${result.issues.length}** |`);
    lines.push('');

    if (result.issues.length === 0) {
      lines.push('✅ No performance issues detected!\n');
      return lines.join('\n');
    }

    // Group by impact
    const high = result.issues.filter((i) => i.impact === 'high');
    const medium = result.issues.filter((i) => i.impact === 'medium');
    const low = result.issues.filter((i) => i.impact === 'low');

    if (high.length > 0) {
      lines.push('## 🔴 High Impact Issues\n');
      this.formatIssueGroup(high, lines);
    }

    if (medium.length > 0) {
      lines.push('## 🟡 Medium Impact Issues\n');
      this.formatIssueGroup(medium, lines);
    }

    if (low.length > 0) {
      lines.push('## 🟢 Low Impact Issues\n');
      this.formatIssueGroup(low, lines);
    }

    return lines.join('\n');
  }

  private formatIssueGroup(issues: PerformanceIssue[], lines: string[]): void {
    for (const issue of issues) {
      lines.push(`### ${issue.type.toUpperCase()}: ${issue.message}\n`);
      lines.push(`- **File:** \`${issue.file}:${issue.line}\``);
      lines.push(`- **Category:** ${issue.category}`);
      lines.push(`- **Estimated Gain:** ${issue.estimatedGain}`);
      lines.push('');

      if (issue.snippet) {
        lines.push('```');
        lines.push(issue.snippet);
        lines.push('```');
        lines.push('');
      }

      lines.push(`> ${issue.description}\n`);
      lines.push(`💡 **Fix:** ${issue.suggestion}\n`);
      lines.push('---\n');
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPerformanceAnalyzer(
  options?: PerformanceAnalyzerOptions
): PerformanceAnalyzer {
  return new PerformanceAnalyzer(options);
}
