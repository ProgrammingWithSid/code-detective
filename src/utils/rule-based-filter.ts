import { CodeChunk, ReviewComment, Severity } from '../types';

/**
 * Rule-based issue detection patterns
 * Catches obvious issues before sending to AI
 */
export interface RuleBasedIssue {
  file: string;
  line: number;
  severity: Severity;
  category: string;
  message: string;
  rule: string;
  fix?: string;
}

/**
 * Rule-based pre-filter
 * Detects common issues using pattern matching
 */
export class RuleBasedFilter {
  /**
   * Analyze chunks and detect issues using rules
   */
  analyzeChunks(chunks: CodeChunk[]): RuleBasedIssue[] {
    const issues: RuleBasedIssue[] = [];

    for (const chunk of chunks) {
      if (!chunk.content) continue;

      const lines = chunk.content.split('\n');
      const filePath = chunk.file;

      // Analyze each line
      lines.forEach((line, index) => {
        const lineNumber = chunk.startLine + index;
        const detectedIssues = this.detectIssuesInLine(line, filePath, lineNumber, chunk);
        issues.push(...detectedIssues);
      });
    }

    return issues;
  }

  /**
   * Detect issues in a single line
   */
  private detectIssuesInLine(
    line: string,
    filePath: string,
    lineNumber: number,
    chunk: CodeChunk
  ): RuleBasedIssue[] {
    const issues: RuleBasedIssue[] = [];
    const trimmedLine = line.trim();

    // Rule 1: Console.log statements
    if (this.matchesPattern(trimmedLine, /console\.(log|debug|info|warn|error)/)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'warning',
        category: 'code_quality',
        message: 'Console statement found. Consider removing or using proper logging.',
        rule: 'no-console',
        fix: `// Remove or replace with proper logging\n// ${trimmedLine}`,
      });
    }

    // Rule 2: TODO/FIXME comments
    if (this.matchesPattern(trimmedLine, /\/\/\s*(TODO|FIXME|HACK|XXX)/i)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'info',
        category: 'code_quality',
        message: 'TODO/FIXME comment found. Consider addressing before merging.',
        rule: 'no-todo',
      });
    }

    // Rule 3: Debugger statements
    if (this.matchesPattern(trimmedLine, /\bdebugger\b/)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'error',
        category: 'bugs',
        message: 'Debugger statement found. Remove before committing.',
        rule: 'no-debugger',
        fix: `// Remove debugger statement\n// ${trimmedLine}`,
      });
    }

    // Rule 4: Empty catch blocks
    if (this.matchesPattern(trimmedLine, /catch\s*\([^)]*\)\s*\{\s*\}/)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'warning',
        category: 'bugs',
        message: 'Empty catch block. Consider handling the error or logging it.',
        rule: 'no-empty-catch',
        fix: `catch (error) {\n  // Handle or log error\n  console.error(error);\n}`,
      });
    }

    // Rule 5: == instead of ===
    if (this.matchesPattern(trimmedLine, /[^=!]==[^=]/)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'warning',
        category: 'code_quality',
        message: 'Use strict equality (===) instead of loose equality (==).',
        rule: 'eqeqeq',
        fix: trimmedLine.replace(/==/g, '==='),
      });
    }

    // Rule 6: != instead of !==
    if (this.matchesPattern(trimmedLine, /[^=!]!=[^=]/)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'warning',
        category: 'code_quality',
        message: 'Use strict inequality (!==) instead of loose inequality (!=).',
        rule: 'eqeqeq',
        fix: trimmedLine.replace(/!=/g, '!=='),
      });
    }

    // Rule 7: var instead of let/const
    if (this.matchesPattern(trimmedLine, /\bvar\s+\w+/)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'suggestion',
        category: 'code_quality',
        message: 'Use let or const instead of var.',
        rule: 'no-var',
        fix: trimmedLine.replace(/\bvar\b/g, 'const'),
      });
    }

    // Rule 8: Hardcoded secrets (basic pattern)
    if (
      this.matchesPattern(
        trimmedLine,
        /(password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]+['"]/i
      )
    ) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'error',
        category: 'security',
        message: 'Potential hardcoded secret detected. Use environment variables instead.',
        rule: 'no-hardcoded-secret',
        fix: `// Use environment variable instead\n// ${trimmedLine}\nconst apiKey = process.env.API_KEY;`,
      });
    }

    // Rule 9: eval() usage
    if (this.matchesPattern(trimmedLine, /\beval\s*\(/)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'error',
        category: 'security',
        message: 'eval() usage detected. This is a security risk.',
        rule: 'no-eval',
        fix: `// Avoid eval(). Use safer alternatives.\n// ${trimmedLine}`,
      });
    }

    // Rule 10: innerHTML without sanitization
    if (this.matchesPattern(trimmedLine, /\.innerHTML\s*=/)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'warning',
        category: 'security',
        message:
          'innerHTML assignment detected. Consider using textContent or sanitize input to prevent XSS.',
        rule: 'no-innerhtml',
        fix: trimmedLine.replace(/\.innerHTML\s*=/g, '.textContent ='),
      });
    }

    // Rule 11: Missing null check before property access
    if (
      this.matchesPattern(trimmedLine, /\w+\.\w+/) &&
      !this.matchesPattern(trimmedLine, /(\?\?|\.\?|if\s*\(|&&)/)
    ) {
      // This is a heuristic - check if previous lines have null checks
      // For now, just flag potential issues
    }

    // Rule 12: setTimeout/setInterval without cleanup
    if (
      this.matchesPattern(trimmedLine, /(setTimeout|setInterval)\s*\(/) &&
      chunk.type === 'function' &&
      chunk.file.match(/\.(tsx|jsx|vue)$/)
    ) {
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: 'warning',
        category: 'performance',
        message: 'setTimeout/setInterval in component. Ensure cleanup in useEffect/onUnmounted.',
        rule: 'no-uncleaned-timers',
      });
    }

    return issues;
  }

  /**
   * Check if line matches pattern
   */
  private matchesPattern(line: string, pattern: RegExp): boolean {
    return pattern.test(line);
  }

  /**
   * Convert rule-based issues to review comments
   */
  convertToReviewComments(issues: RuleBasedIssue[]): ReviewComment[] {
    return issues.map((issue) => ({
      file: issue.file,
      line: issue.line,
      body: issue.message,
      severity: issue.severity,
      category: issue.category,
      rule: issue.rule,
      fix: issue.fix,
    }));
  }

  /**
   * Filter out issues that should be handled by AI
   * Returns issues that can be caught by rules
   */
  filterRuleBasedIssues(
    allIssues: ReviewComment[],
    ruleBasedIssues: ReviewComment[]
  ): {
    ruleBased: ReviewComment[];
    aiOnly: ReviewComment[];
  } {
    const ruleBasedSet = new Set(ruleBasedIssues.map((i) => `${i.file}:${i.line}:${i.rule}`));

    const ruleBased: ReviewComment[] = [];
    const aiOnly: ReviewComment[] = [];

    for (const issue of allIssues) {
      const key = `${issue.file}:${issue.line}:${issue.rule || ''}`;
      if (ruleBasedSet.has(key) || issue.rule) {
        ruleBased.push(issue);
      } else {
        aiOnly.push(issue);
      }
    }

    return { ruleBased, aiOnly };
  }
}
