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
        const detectedIssues = this.detectIssuesInLine(
          line,
          filePath,
          lineNumber,
          chunk,
          lines,
          index
        );
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
    chunk: CodeChunk,
    lines: string[],
    index: number
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

    // Rule 13: ESLint disable comments without reason
    // Match: // eslint-disable, // eslint-disable-next-line, // eslint-disable-line
    // Also match: /* eslint-disable */, /* eslint-disable-next-line */, etc.
    const eslintDisablePattern =
      /(?:^|\s)(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?(?:\s+[\w-,\s]+)?(?:\s*\*\/)?/i;
    if (this.matchesPattern(trimmedLine, eslintDisablePattern)) {
      // Check if there's a reason comment (after -- or in a separate comment)
      // Reason can be: -- reason text, or /* reason */, or // reason on same/next line
      const hasReasonInLine =
        (trimmedLine.includes('--') && trimmedLine.match(/--\s+.+/)) ||
        (trimmedLine.match(/\/\*\s*.+\s*\*\//) &&
          !trimmedLine.match(/\/\*\s*eslint-disable.*\*\//));

      // Check if next line has an explanation comment
      const nextLine: string = index < lines.length - 1 ? (lines[index + 1]?.trim() ?? '') : '';
      const hasReasonInNextLine =
        nextLine.length > 0 &&
        (nextLine.startsWith('//') || nextLine.startsWith('/*')) &&
        !nextLine.match(/eslint-disable/i) &&
        nextLine.length > 3; // More than just "//" or "/* */"

      if (!hasReasonInLine && !hasReasonInNextLine) {
        // Extract the rule name(s) if present (can be multiple rules separated by commas)
        const ruleMatch = trimmedLine.match(
          /eslint-disable(?:-next-line|-line)?(?:\s+([\w-,\s]+))?/i
        );
        const ruleName = ruleMatch?.[1]?.trim() || 'rule';

        issues.push({
          file: filePath,
          line: lineNumber,
          severity: 'suggestion',
          category: 'code_quality',
          message: `ESLint disable comment found without explanation. Add a reason comment (using --) explaining why the lint rule is disabled.`,
          rule: 'eslint-disable-without-reason',
          fix: this.generateEslintDisableFix(trimmedLine, ruleName),
        });
      }
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
   * Generate fix for ESLint disable comment without reason
   */
  private generateEslintDisableFix(line: string, ruleName: string): string {
    // Determine if it's a single-line or multi-line comment
    const isMultiLine = line.includes('/*');
    const isNextLine = line.includes('next-line');
    const isLine = line.includes('-line') && !line.includes('next-line');

    // Extract the rule name(s) from the original line
    const ruleMatch = line.match(/eslint-disable(?:-next-line|-line)?(?:\s+([\w-,\s]+))?/i);
    const actualRuleName = ruleMatch?.[1]?.trim() || ruleName;

    // Preserve the original comment style
    if (isMultiLine) {
      // Multi-line comment: /* eslint-disable-next-line rule-name */
      const prefix = `/* eslint-disable${isNextLine ? '-next-line' : isLine ? '-line' : ''}`;
      const suffix = actualRuleName ? ` ${actualRuleName}` : '';
      return `${prefix}${suffix} -- Add reason explaining why this rule is disabled */`;
    } else {
      // Single-line comment: // eslint-disable-next-line rule-name
      const prefix = `// eslint-disable${isNextLine ? '-next-line' : isLine ? '-line' : ''}`;
      const suffix = actualRuleName ? ` ${actualRuleName}` : '';
      return `${prefix}${suffix} -- Add reason explaining why this rule is disabled`;
    }
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
