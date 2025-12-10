/**
 * Security Analyzer - Detects security vulnerabilities in code
 *
 * Detects:
 * - SQL Injection
 * - XSS (Cross-Site Scripting)
 * - Path Traversal
 * - Command Injection
 * - Sensitive Data Exposure
 * - Insecure Dependencies
 * - Authentication Issues
 * - Cryptographic Issues
 */

import { Severity } from '../types';

// ============================================================================
// Types
// ============================================================================

export type SecurityIssueType =
  | 'sql-injection'
  | 'xss'
  | 'path-traversal'
  | 'command-injection'
  | 'sensitive-data-exposure'
  | 'insecure-dependency'
  | 'weak-crypto'
  | 'hardcoded-secret'
  | 'insecure-auth'
  | 'insecure-deserialization'
  | 'ssrf'
  | 'xxe'
  | 'open-redirect'
  | 'csrf'
  | 'other';

export interface SecurityIssue {
  /** Issue type */
  type: SecurityIssueType;
  /** Severity level */
  severity: Severity;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column?: number;
  /** Issue message */
  message: string;
  /** Detailed description */
  description: string;
  /** CWE ID if applicable */
  cweId?: string;
  /** OWASP category */
  owaspCategory?: string;
  /** Suggested fix */
  suggestion?: string;
  /** Code snippet */
  snippet?: string;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** References */
  references?: string[];
}

export interface SecurityAnalysisResult {
  /** Found issues */
  issues: SecurityIssue[];
  /** Files analyzed */
  filesAnalyzed: number;
  /** Analysis time (ms) */
  analysisTime: number;
  /** Summary by severity */
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** Summary by type */
  byType: Record<SecurityIssueType, number>;
}

export interface SecurityAnalyzerOptions {
  /** Issue types to check */
  enabledChecks?: SecurityIssueType[];
  /** Minimum severity to report */
  minSeverity?: Severity;
  /** Custom patterns to detect */
  customPatterns?: SecurityPattern[];
  /** Files/patterns to ignore */
  ignorePatterns?: string[];
  /** Include low confidence issues */
  includeLowConfidence?: boolean;
}

export interface SecurityPattern {
  /** Pattern name */
  name: string;
  /** Issue type */
  type: SecurityIssueType;
  /** Pattern to match */
  pattern: RegExp;
  /** Languages this applies to */
  languages: string[];
  /** Severity */
  severity: Severity;
  /** Message template */
  message: string;
  /** CWE ID */
  cweId?: string;
  /** Confidence */
  confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// Default Security Patterns
// ============================================================================

const DEFAULT_SECURITY_PATTERNS: SecurityPattern[] = [
  // SQL Injection
  {
    name: 'sql-string-concat',
    type: 'sql-injection',
    pattern: /(?:execute|query|raw)\s*\(\s*['"`].*\+.*\$\{?\w+/gi,
    languages: ['typescript', 'javascript', 'python'],
    severity: 'error',
    message: 'Potential SQL injection via string concatenation',
    cweId: 'CWE-89',
    confidence: 'high',
  },
  {
    name: 'sql-template-literal',
    type: 'sql-injection',
    pattern: /(?:execute|query|raw)\s*\(\s*`[^`]*\$\{[^}]+\}/gi,
    languages: ['typescript', 'javascript'],
    severity: 'error',
    message: 'Potential SQL injection via template literal',
    cweId: 'CWE-89',
    confidence: 'high',
  },

  // XSS
  {
    name: 'innerhtml-assignment',
    type: 'xss',
    pattern: /\.innerHTML\s*=\s*(?!\s*['"`])/g,
    languages: ['typescript', 'javascript'],
    severity: 'error',
    message: 'Potential XSS via innerHTML assignment with dynamic content',
    cweId: 'CWE-79',
    confidence: 'high',
  },
  {
    name: 'dangerous-html',
    type: 'xss',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{/g,
    languages: ['typescript', 'javascript', 'jsx', 'tsx'],
    severity: 'warning',
    message: 'Use of dangerouslySetInnerHTML - ensure content is sanitized',
    cweId: 'CWE-79',
    confidence: 'medium',
  },
  {
    name: 'document-write',
    type: 'xss',
    pattern: /document\.write\s*\(/g,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    message: 'document.write() can lead to XSS vulnerabilities',
    cweId: 'CWE-79',
    confidence: 'medium',
  },

  // Command Injection
  {
    name: 'exec-with-input',
    type: 'command-injection',
    pattern: /(?:exec|spawn|execSync|spawnSync)\s*\([^)]*(?:\+|`|\$\{)/g,
    languages: ['typescript', 'javascript'],
    severity: 'error',
    message: 'Potential command injection - user input in shell command',
    cweId: 'CWE-78',
    confidence: 'high',
  },
  {
    name: 'eval-usage',
    type: 'command-injection',
    pattern: /\beval\s*\(/g,
    languages: ['typescript', 'javascript', 'python'],
    severity: 'error',
    message: 'Use of eval() is dangerous and can lead to code injection',
    cweId: 'CWE-95',
    confidence: 'high',
  },

  // Path Traversal
  {
    name: 'path-concat',
    type: 'path-traversal',
    pattern:
      /(?:readFile|writeFile|readFileSync|writeFileSync|createReadStream|createWriteStream)\s*\([^)]*(?:\+|`|\$\{)/g,
    languages: ['typescript', 'javascript'],
    severity: 'error',
    message: 'Potential path traversal - user input in file path',
    cweId: 'CWE-22',
    confidence: 'medium',
  },

  // Sensitive Data Exposure
  {
    name: 'hardcoded-password',
    type: 'hardcoded-secret',
    pattern:
      /(?:password|passwd|pwd|secret|apiKey|api_key|apiSecret|api_secret|token|auth_token)\s*[:=]\s*['"`][^'"`]{8,}['"`]/gi,
    languages: ['typescript', 'javascript', 'python', 'go', 'java'],
    severity: 'error',
    message: 'Potential hardcoded secret detected',
    cweId: 'CWE-798',
    confidence: 'medium',
  },
  {
    name: 'aws-key',
    type: 'hardcoded-secret',
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
    languages: ['typescript', 'javascript', 'python', 'go', 'java'],
    severity: 'error',
    message: 'Potential AWS access key detected',
    cweId: 'CWE-798',
    confidence: 'high',
  },
  {
    name: 'private-key',
    type: 'hardcoded-secret',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    languages: ['typescript', 'javascript', 'python', 'go', 'java'],
    severity: 'error',
    message: 'Private key detected in source code',
    cweId: 'CWE-798',
    confidence: 'high',
  },

  // Weak Cryptography
  {
    name: 'md5-usage',
    type: 'weak-crypto',
    pattern: /(?:createHash|hashlib\.)\s*\(\s*['"`]md5['"`]\)/gi,
    languages: ['typescript', 'javascript', 'python'],
    severity: 'warning',
    message: 'MD5 is cryptographically weak - use SHA-256 or better',
    cweId: 'CWE-328',
    confidence: 'high',
  },
  {
    name: 'sha1-usage',
    type: 'weak-crypto',
    pattern: /(?:createHash|hashlib\.)\s*\(\s*['"`]sha1['"`]\)/gi,
    languages: ['typescript', 'javascript', 'python'],
    severity: 'warning',
    message: 'SHA-1 is cryptographically weak - use SHA-256 or better',
    cweId: 'CWE-328',
    confidence: 'high',
  },

  // Insecure Auth
  {
    name: 'cors-wildcard',
    type: 'insecure-auth',
    pattern: /(?:Access-Control-Allow-Origin|cors)\s*[:=]\s*['"`]\*['"`]/gi,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    message: 'CORS wildcard (*) allows any origin - consider restricting',
    cweId: 'CWE-942',
    confidence: 'high',
  },
  {
    name: 'jwt-no-verify',
    type: 'insecure-auth',
    pattern: /jwt\.decode\s*\(/g,
    languages: ['typescript', 'javascript', 'python'],
    severity: 'warning',
    message: 'JWT decoded without verification - use jwt.verify() instead',
    cweId: 'CWE-347',
    confidence: 'medium',
  },

  // SSRF
  {
    name: 'fetch-user-input',
    type: 'ssrf',
    pattern: /(?:fetch|axios|request)\s*\(\s*(?:[^'"`)+]+\+|`[^`]*\$\{)/g,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    message: 'Potential SSRF - user input in URL',
    cweId: 'CWE-918',
    confidence: 'medium',
  },

  // Open Redirect
  {
    name: 'redirect-user-input',
    type: 'open-redirect',
    pattern: /(?:redirect|location\.href|window\.location)\s*[:=]\s*(?:[^'"`]+\+|`[^`]*\$\{)/g,
    languages: ['typescript', 'javascript'],
    severity: 'warning',
    message: 'Potential open redirect vulnerability',
    cweId: 'CWE-601',
    confidence: 'medium',
  },

  // Insecure Deserialization
  {
    name: 'json-parse-unchecked',
    type: 'insecure-deserialization',
    pattern: /JSON\.parse\s*\(\s*(?:req\.|request\.|body|params)/g,
    languages: ['typescript', 'javascript'],
    severity: 'info',
    message: 'Consider validating JSON structure after parsing',
    cweId: 'CWE-502',
    confidence: 'low',
  },
];

// ============================================================================
// Security Analyzer Class
// ============================================================================

export class SecurityAnalyzer {
  private options: SecurityAnalyzerOptions;
  private patterns: SecurityPattern[];

  constructor(options: SecurityAnalyzerOptions = {}) {
    this.options = {
      includeLowConfidence: false,
      ...options,
    };

    this.patterns = [...DEFAULT_SECURITY_PATTERNS, ...(options.customPatterns || [])];

    // Filter by enabled checks
    if (options.enabledChecks) {
      this.patterns = this.patterns.filter((p) => options.enabledChecks!.includes(p.type));
    }
  }

  /**
   * Analyze files for security issues
   */
  analyze(files: Array<{ path: string; content: string }>): SecurityAnalysisResult {
    const startTime = Date.now();
    const issues: SecurityIssue[] = [];
    const byType: Record<SecurityIssueType, number> = {} as Record<SecurityIssueType, number>;

    for (const file of files) {
      const language = this.detectLanguage(file.path);
      const fileIssues = this.analyzeFile(file.path, file.content, language);
      issues.push(...fileIssues);
    }

    // Filter by severity
    const filteredIssues = this.filterBySeverity(issues);

    // Filter by confidence
    const finalIssues = this.options.includeLowConfidence
      ? filteredIssues
      : filteredIssues.filter((i) => i.confidence !== 'low');

    // Calculate summary
    for (const issue of finalIssues) {
      byType[issue.type] = (byType[issue.type] || 0) + 1;
    }

    return {
      issues: finalIssues,
      filesAnalyzed: files.length,
      analysisTime: Date.now() - startTime,
      summary: {
        critical: finalIssues.filter((i) => i.severity === 'error' && i.confidence === 'high')
          .length,
        high: finalIssues.filter((i) => i.severity === 'error').length,
        medium: finalIssues.filter((i) => i.severity === 'warning').length,
        low: finalIssues.filter((i) => i.severity === 'info').length,
      },
      byType,
    };
  }

  /**
   * Analyze a single file
   */
  private analyzeFile(path: string, content: string, language: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = content.split('\n');

    // Check if file should be ignored
    if (this.shouldIgnore(path)) {
      return issues;
    }

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
          description: this.getDescription(pattern),
          cweId: pattern.cweId,
          owaspCategory: this.getOwaspCategory(pattern.type),
          suggestion: this.getSuggestion(pattern.type),
          snippet: snippet.trim(),
          confidence: pattern.confidence,
          references: this.getReferences(pattern.type, pattern.cweId),
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
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      java: 'java',
      rb: 'ruby',
      php: 'php',
    };
    return map[ext] || 'unknown';
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnore(path: string): boolean {
    const ignorePatterns = this.options.ignorePatterns || [];
    const defaultIgnore = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '__tests__',
      '*.test.*',
      '*.spec.*',
    ];

    const allPatterns = [...defaultIgnore, ...ignorePatterns];

    return allPatterns.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(path);
      }
      return path.includes(pattern);
    });
  }

  /**
   * Filter issues by minimum severity
   */
  private filterBySeverity(issues: SecurityIssue[]): SecurityIssue[] {
    if (!this.options.minSeverity) return issues;

    const severityOrder: Severity[] = ['info', 'warning', 'error'];
    const minIndex = severityOrder.indexOf(this.options.minSeverity);

    return issues.filter((issue) => severityOrder.indexOf(issue.severity) >= minIndex);
  }

  /**
   * Get description for pattern
   */
  private getDescription(pattern: SecurityPattern): string {
    const descriptions: Record<SecurityIssueType, string> = {
      'sql-injection':
        'SQL injection allows attackers to execute arbitrary SQL commands, potentially accessing or modifying database data.',
      xss: 'Cross-Site Scripting (XSS) allows attackers to inject malicious scripts into web pages viewed by other users.',
      'path-traversal':
        'Path traversal allows attackers to access files outside the intended directory.',
      'command-injection':
        'Command injection allows attackers to execute arbitrary system commands.',
      'sensitive-data-exposure':
        'Sensitive data exposure can lead to unauthorized access to confidential information.',
      'insecure-dependency':
        'Using dependencies with known vulnerabilities can expose your application to attacks.',
      'weak-crypto': 'Weak cryptographic algorithms can be broken, exposing encrypted data.',
      'hardcoded-secret':
        'Hardcoded secrets can be extracted from source code and used maliciously.',
      'insecure-auth':
        'Insecure authentication can allow unauthorized access to protected resources.',
      'insecure-deserialization': 'Insecure deserialization can lead to remote code execution.',
      ssrf: 'Server-Side Request Forgery allows attackers to make requests from the server to internal resources.',
      xxe: 'XML External Entity attacks can expose internal files and services.',
      'open-redirect': 'Open redirects can be used in phishing attacks.',
      csrf: 'Cross-Site Request Forgery allows attackers to perform actions on behalf of authenticated users.',
      other: 'Security issue detected.',
    };
    return descriptions[pattern.type] || descriptions.other;
  }

  /**
   * Get OWASP category
   */
  private getOwaspCategory(type: SecurityIssueType): string {
    const categories: Record<SecurityIssueType, string> = {
      'sql-injection': 'A03:2021 - Injection',
      xss: 'A03:2021 - Injection',
      'command-injection': 'A03:2021 - Injection',
      'path-traversal': 'A01:2021 - Broken Access Control',
      'sensitive-data-exposure': 'A02:2021 - Cryptographic Failures',
      'insecure-dependency': 'A06:2021 - Vulnerable Components',
      'weak-crypto': 'A02:2021 - Cryptographic Failures',
      'hardcoded-secret': 'A02:2021 - Cryptographic Failures',
      'insecure-auth': 'A07:2021 - Identification Failures',
      'insecure-deserialization': 'A08:2021 - Software Integrity Failures',
      ssrf: 'A10:2021 - Server-Side Request Forgery',
      xxe: 'A05:2021 - Security Misconfiguration',
      'open-redirect': 'A01:2021 - Broken Access Control',
      csrf: 'A01:2021 - Broken Access Control',
      other: 'Other',
    };
    return categories[type] || categories.other;
  }

  /**
   * Get suggestion for fix
   */
  private getSuggestion(type: SecurityIssueType): string {
    const suggestions: Record<SecurityIssueType, string> = {
      'sql-injection':
        'Use parameterized queries or prepared statements instead of string concatenation.',
      xss: 'Sanitize user input and use safe DOM APIs like textContent instead of innerHTML.',
      'command-injection':
        'Avoid shell commands with user input. If necessary, use allowlists and escape special characters.',
      'path-traversal':
        'Validate and sanitize file paths. Use path.resolve() and check against a base directory.',
      'sensitive-data-exposure': 'Use environment variables or secure secret management systems.',
      'insecure-dependency': 'Update dependencies to their latest secure versions.',
      'weak-crypto': 'Use SHA-256 or SHA-3 for hashing, and AES-256 for encryption.',
      'hardcoded-secret': 'Move secrets to environment variables or a secure vault.',
      'insecure-auth': 'Implement proper authentication with secure session management.',
      'insecure-deserialization': 'Validate and sanitize data before deserialization.',
      ssrf: 'Validate URLs against an allowlist of permitted domains.',
      xxe: 'Disable external entity processing in XML parsers.',
      'open-redirect': 'Validate redirect URLs against an allowlist.',
      csrf: 'Implement CSRF tokens and verify them on state-changing requests.',
      other: 'Review and address the security concern.',
    };
    return suggestions[type] || suggestions.other;
  }

  /**
   * Get references
   */
  private getReferences(type: SecurityIssueType, cweId?: string): string[] {
    const refs: string[] = [];

    if (cweId) {
      refs.push(`https://cwe.mitre.org/data/definitions/${cweId.replace('CWE-', '')}.html`);
    }

    const owaspRefs: Partial<Record<SecurityIssueType, string>> = {
      'sql-injection': 'https://owasp.org/Top10/A03_2021-Injection/',
      xss: 'https://owasp.org/Top10/A03_2021-Injection/',
      ssrf: 'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/',
    };

    if (owaspRefs[type]) {
      refs.push(owaspRefs[type]);
    }

    return refs;
  }

  /**
   * Format results as markdown
   */
  formatAsMarkdown(result: SecurityAnalysisResult): string {
    const lines: string[] = [];

    lines.push('# 🔒 Security Analysis Report\n');

    // Summary
    lines.push('## Summary\n');
    lines.push(`| Severity | Count |`);
    lines.push(`|----------|-------|`);
    lines.push(`| 🔴 Critical | ${result.summary.critical} |`);
    lines.push(`| 🟠 High | ${result.summary.high} |`);
    lines.push(`| 🟡 Medium | ${result.summary.medium} |`);
    lines.push(`| 🟢 Low | ${result.summary.low} |`);
    lines.push(`| **Total** | **${result.issues.length}** |`);
    lines.push('');

    if (result.issues.length === 0) {
      lines.push('✅ No security issues detected!\n');
      return lines.join('\n');
    }

    // Group by severity
    const critical = result.issues.filter((i) => i.severity === 'error' && i.confidence === 'high');
    const high = result.issues.filter((i) => i.severity === 'error' && i.confidence !== 'high');
    const medium = result.issues.filter((i) => i.severity === 'warning');
    const low = result.issues.filter((i) => i.severity === 'info');

    if (critical.length > 0) {
      lines.push('## 🔴 Critical Issues\n');
      this.formatIssueGroup(critical, lines);
    }

    if (high.length > 0) {
      lines.push('## 🟠 High Severity Issues\n');
      this.formatIssueGroup(high, lines);
    }

    if (medium.length > 0) {
      lines.push('## 🟡 Medium Severity Issues\n');
      this.formatIssueGroup(medium, lines);
    }

    if (low.length > 0) {
      lines.push('## 🟢 Low Severity Issues\n');
      this.formatIssueGroup(low, lines);
    }

    return lines.join('\n');
  }

  private formatIssueGroup(issues: SecurityIssue[], lines: string[]): void {
    for (const issue of issues) {
      lines.push(`### ${issue.type.toUpperCase()}: ${issue.message}\n`);
      lines.push(`- **File:** \`${issue.file}:${issue.line}\``);
      lines.push(`- **CWE:** ${issue.cweId || 'N/A'}`);
      lines.push(`- **OWASP:** ${issue.owaspCategory}`);
      lines.push(`- **Confidence:** ${issue.confidence}`);
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

export function createSecurityAnalyzer(options?: SecurityAnalyzerOptions): SecurityAnalyzer {
  return new SecurityAnalyzer(options);
}
