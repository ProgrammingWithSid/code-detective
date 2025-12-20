/**
 * Linter Integration - Runs various linters and code quality tools
 *
 * Supports:
 * - ESLint (JavaScript/TypeScript)
 * - Prettier (Code formatting)
 * - TypeScript Compiler (Type checking)
 * - Pylint (Python)
 * - RuboCop (Ruby)
 * - golangci-lint (Go)
 * - rust-clippy (Rust)
 */

import { exec } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { ReviewComment, Severity } from '../types';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export type LinterTool =
  // JavaScript/TypeScript
  | 'eslint'
  | 'prettier'
  | 'typescript'
  | 'tslint'
  | 'jshint'
  | 'standard'
  | 'xo'
  | 'biome'
  | 'deno-lint'
  // Python
  | 'pylint'
  | 'flake8'
  | 'black'
  | 'mypy'
  | 'isort'
  | 'pydocstyle'
  | 'bandit'
  | 'pylama'
  // Ruby
  | 'rubocop'
  // Go
  | 'golangci-lint'
  | 'gofmt'
  | 'go-vet'
  | 'staticcheck'
  | 'ineffassign'
  // Rust
  | 'rust-clippy'
  | 'rustfmt'
  // Java
  | 'checkstyle'
  | 'pmd'
  | 'spotbugs'
  | 'error-prone'
  // General
  | 'shellcheck'
  | 'hadolint'
  | 'markdownlint'
  | 'yamllint'
  | 'jsonlint'
  | 'custom';

export interface LinterIssue {
  file: string;
  line: number;
  column?: number;
  message: string;
  rule?: string;
  severity: Severity;
  fix?: string;
  tool: LinterTool;
}

export interface LinterResult {
  issues: LinterIssue[];
  filesAnalyzed: number;
  analysisTime: number;
  toolsUsed: LinterTool[];
  summary: {
    errors: number;
    warnings: number;
    suggestions: number;
  };
}

export interface LinterConfig {
  enabled: boolean;
  tools: LinterTool[];
  /** Custom command mappings */
  customCommands?: Record<string, string>;
  /** Files/patterns to ignore */
  ignorePatterns?: string[];
  /** Working directory */
  workingDir?: string;
  /** ESLint specific config */
  eslint?: {
    configFile?: string;
    extensions?: string[];
  };
  /** Prettier specific config */
  prettier?: {
    configFile?: string;
    checkOnly?: boolean;
  };
  /** TypeScript specific config */
  typescript?: {
    configFile?: string;
    noEmit?: boolean;
  };
}

// ============================================================================
// Linter Integration Class
// ============================================================================

export class LinterIntegration {
  private config: LinterConfig;
  private workingDir: string;

  constructor(config: LinterConfig = { enabled: true, tools: [] }) {
    this.config = {
      ...config,
      enabled: config.enabled ?? true,
      tools: config.tools ?? [],
    };
    this.workingDir = config.workingDir || process.cwd();
  }

  /**
   * Run linters on changed files
   */
  async analyze(files: Array<{ path: string; content: string }>): Promise<LinterResult> {
    if (!this.config.enabled || this.config.tools.length === 0) {
      return {
        issues: [],
        filesAnalyzed: 0,
        analysisTime: 0,
        toolsUsed: [],
        summary: { errors: 0, warnings: 0, suggestions: 0 },
      };
    }

    const startTime = Date.now();
    const allIssues: LinterIssue[] = [];
    const toolsUsed: LinterTool[] = [];

    // Filter files that should be analyzed
    const filesToAnalyze = files.filter((f) => !this.shouldIgnore(f.path));

    if (filesToAnalyze.length === 0) {
      return {
        issues: [],
        filesAnalyzed: 0,
        analysisTime: Date.now() - startTime,
        toolsUsed: [],
        summary: { errors: 0, warnings: 0, suggestions: 0 },
      };
    }

    // Run each enabled linter
    for (const tool of this.config.tools) {
      try {
        const issues = await this.runLinter(tool, filesToAnalyze);
        // Check if tool analyzed relevant files
        const hasRelevantFiles = filesToAnalyze.some((f) => {
          // Check if tool is relevant for this file type
          if (tool === 'jsonlint') return f.path.endsWith('.json');
          if (tool === 'yamllint') return f.path.endsWith('.yml') || f.path.endsWith('.yaml');
          if (tool === 'markdownlint') return f.path.endsWith('.md');
          const jsTools = [
            'eslint',
            'prettier',
            'typescript',
            'tslint',
            'jshint',
            'standard',
            'xo',
            'biome',
            'deno-lint',
          ];
          if (jsTools.includes(tool)) {
            return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].some((ext) =>
              f.path.endsWith(ext)
            );
          }
          const pyTools = ['pylint', 'flake8', 'black', 'mypy', 'isort', 'pydocstyle', 'pylama'];
          if (pyTools.includes(tool)) return f.path.endsWith('.py');
          if (tool === 'rubocop') return f.path.endsWith('.rb');
          const goTools = ['golangci-lint', 'gofmt', 'go-vet', 'staticcheck', 'ineffassign'];
          if (goTools.includes(tool)) return f.path.endsWith('.go');
          if (tool === 'rust-clippy' || tool === 'rustfmt') return f.path.endsWith('.rs');
          if (tool === 'shellcheck') return f.path.endsWith('.sh') || f.path.endsWith('.bash');
          if (tool === 'hadolint')
            return f.path.endsWith('Dockerfile') || f.path.includes('Dockerfile');
          return true; // For other tools, assume they can analyze any file
        });

        // Add tool to toolsUsed if it analyzed relevant files (even if no issues found)
        if (hasRelevantFiles) {
          toolsUsed.push(tool);
          if (issues.length > 0) {
            allIssues.push(...issues);
          }
        }
      } catch (error) {
        console.warn(`Failed to run ${tool}:`, error instanceof Error ? error.message : error);
      }
    }

    const analysisTime = Date.now() - startTime;

    return {
      issues: allIssues,
      filesAnalyzed: filesToAnalyze.length,
      analysisTime,
      toolsUsed,
      summary: {
        errors: allIssues.filter((i) => i.severity === 'error').length,
        warnings: allIssues.filter((i) => i.severity === 'warning').length,
        suggestions: allIssues.filter((i) => i.severity === 'suggestion' || i.severity === 'info')
          .length,
      },
    };
  }

  /**
   * Convert linter issues to review comments
   */
  convertToReviewComments(result: LinterResult): ReviewComment[] {
    return result.issues.map((issue) => ({
      file: issue.file,
      line: issue.line,
      body: `[${issue.tool}] ${issue.message}${issue.rule ? ` (${issue.rule})` : ''}`,
      severity: issue.severity,
      rule: issue.rule,
      category: `linter-${issue.tool}`,
      fix: issue.fix,
      tool: issue.tool,
    }));
  }

  // ============================================================================
  // Private Methods - Linter Execution
  // ============================================================================

  private async runLinter(
    tool: LinterTool,
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    switch (tool) {
      case 'eslint':
        return this.runESLint(files);
      case 'prettier':
        return this.runPrettier(files);
      case 'typescript':
        return this.runTypeScript(files);
      case 'tslint':
        return this.runTSLint(files);
      case 'jshint':
        return this.runJSHint(files);
      case 'standard':
        return this.runStandard(files);
      case 'xo':
        return this.runXO(files);
      case 'biome':
        return this.runBiome(files);
      case 'deno-lint':
        return this.runDenoLint(files);
      case 'pylint':
        return this.runPylint(files);
      case 'flake8':
        return this.runFlake8(files);
      case 'black':
        return this.runBlack(files);
      case 'mypy':
        return this.runMypy(files);
      case 'isort':
        return this.runIsort(files);
      case 'pydocstyle':
        return this.runPydocstyle(files);
      case 'pylama':
        return this.runPylama(files);
      case 'rubocop':
        return this.runRuboCop(files);
      case 'golangci-lint':
        return this.runGolangciLint(files);
      case 'gofmt':
        return this.runGofmt(files);
      case 'go-vet':
        return this.runGoVet(files);
      case 'staticcheck':
        return this.runStaticcheck(files);
      case 'ineffassign':
        return this.runIneffassign(files);
      case 'rust-clippy':
        return this.runRustClippy(files);
      case 'rustfmt':
        return this.runRustfmt(files);
      case 'checkstyle':
        return this.runCheckstyle(files);
      case 'pmd':
        return this.runPMD(files);
      case 'spotbugs':
        return this.runSpotbugs(files);
      case 'error-prone':
        return this.runErrorProne(files);
      case 'shellcheck':
        return this.runShellCheck(files);
      case 'hadolint':
        return this.runHadolint(files);
      case 'markdownlint':
        return this.runMarkdownlint(files);
      case 'yamllint':
        return this.runYamllint(files);
      case 'jsonlint':
        return this.runJsonlint(files);
      case 'custom':
        return this.runCustomLinter(files);
      default:
        return [];
    }
  }

  private async runESLint(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const jsFiles = files.filter((f) =>
      ['.js', '.jsx', '.ts', '.tsx'].some((ext) => f.path.endsWith(ext))
    );

    if (jsFiles.length === 0) return [];

    try {
      const eslintConfig = this.config.eslint?.configFile || '.eslintrc.json';
      const configFlag = existsSync(join(this.workingDir, eslintConfig))
        ? `--config ${eslintConfig}`
        : '';

      const filePaths = jsFiles.map((f) => f.path).join(' ');
      const command = `npx eslint ${configFlag} --format json ${filePaths}`;

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (stderr && !stdout) {
        // ESLint might output warnings to stderr
        return [];
      }

      const results = JSON.parse(stdout || '[]') as Array<{
        filePath: string;
        messages?: Array<{
          line?: number;
          column?: number;
          message: string;
          ruleId?: string;
          severity: number;
          fix?: unknown;
        }>;
      }>;
      const issues: LinterIssue[] = [];

      for (const result of results) {
        if (result.messages) {
          for (const message of result.messages) {
            issues.push({
              file: result.filePath,
              line: message.line || 1,
              column: message.column,
              message: message.message || 'ESLint issue',
              rule: message.ruleId,
              severity: this.mapESLintSeverity(message.severity),
              fix: message.fix ? 'Auto-fixable with eslint --fix' : undefined,
              tool: 'eslint',
            });
          }
        }
      }

      return issues;
    } catch (error: unknown) {
      // ESLint might not be installed or configured
      if (error instanceof Error && error.message.includes('Command failed')) {
        return [];
      }
      throw error;
    }
  }

  private async runPrettier(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const supportedFiles = files.filter((f) =>
      ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.md', '.html'].some((ext) =>
        f.path.endsWith(ext)
      )
    );

    if (supportedFiles.length === 0) return [];

    try {
      const prettierConfig = this.config.prettier?.configFile || '.prettierrc';
      const configFlag = existsSync(join(this.workingDir, prettierConfig))
        ? `--config ${prettierConfig}`
        : '';

      const filePaths = supportedFiles.map((f) => f.path).join(' ');
      const command = `npx prettier ${configFlag} --check --list-different ${filePaths}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const issues: LinterIssue[] = [];
      const unformattedFiles = stdout.trim().split('\n').filter(Boolean);

      for (const file of unformattedFiles) {
        issues.push({
          file,
          line: 1,
          message: 'Code formatting does not match Prettier configuration',
          severity: 'warning',
          fix: 'Run prettier --write to auto-format',
          tool: 'prettier',
        });
      }

      return issues;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Command failed')) {
        return [];
      }
      throw error;
    }
  }

  private async runTypeScript(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const tsFiles = files.filter((f) => ['.ts', '.tsx'].some((ext) => f.path.endsWith(ext)));

    if (tsFiles.length === 0) return [];

    try {
      const tsConfig = this.config.typescript?.configFile || 'tsconfig.json';
      const configFlag = existsSync(join(this.workingDir, tsConfig)) ? `--project ${tsConfig}` : '';
      const filePaths = tsFiles.map((f) => f.path).join(' ');
      const command = `npx tsc ${configFlag} --noEmit ${filePaths}`;

      const { stderr } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const issues: LinterIssue[] = [];
      const lines = stderr.split('\n');

      for (const line of lines) {
        const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(.+)$/);
        if (match) {
          const [, file, lineNum, col, severity, message] = match;
          if (file && lineNum && col && severity && message) {
            issues.push({
              file,
              line: parseInt(lineNum, 10),
              column: parseInt(col, 10),
              message: message.trim(),
              severity: severity === 'error' ? 'error' : 'warning',
              tool: 'typescript',
            });
          }
        }
      }

      return issues;
    } catch (error: unknown) {
      // TypeScript errors are expected when there are type issues
      if (error instanceof Error && error.message.includes('Command failed')) {
        // Parse the error output
        return this.parseTypeScriptErrors(error.message);
      }
      return [];
    }
  }

  private parseTypeScriptErrors(errorOutput: string): LinterIssue[] {
    const issues: LinterIssue[] = [];
    const lines = errorOutput.split('\n');

    for (const line of lines) {
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(.+)$/);
      if (match) {
        const [, file, lineNum, col, severity, message] = match;
        if (file && lineNum && col && severity && message) {
          issues.push({
            file,
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            message: message.trim(),
            severity: severity === 'error' ? 'error' : 'warning',
            tool: 'typescript',
          });
        }
      }
    }

    return issues;
  }

  private async runPylint(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const pyFiles = files.filter((f) => f.path.endsWith('.py'));

    if (pyFiles.length === 0) return [];

    try {
      const filePaths = pyFiles.map((f) => f.path).join(' ');
      const command = `pylint --output-format=json ${filePaths}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const results = JSON.parse(stdout || '[]') as Array<{
        path?: string;
        line?: number;
        column?: number;
        message?: string;
        messageId?: string;
        type?: string;
      }>;
      const issues: LinterIssue[] = [];

      for (const result of results) {
        issues.push({
          file: result.path || '',
          line: result.line || 1,
          column: result.column,
          message: result.message || '',
          rule: result.messageId,
          severity: this.mapPylintSeverity(result.type || ''),
          tool: 'pylint',
        });
      }

      return issues;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Command failed')) {
        return [];
      }
      throw error;
    }
  }

  private async runRuboCop(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const rbFiles = files.filter((f) => f.path.endsWith('.rb'));

    if (rbFiles.length === 0) return [];

    try {
      const filePaths = rbFiles.map((f) => f.path).join(' ');
      const command = `rubocop --format json ${filePaths}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const results = JSON.parse(stdout || '{}') as {
        files?: Record<
          string,
          {
            offenses?: Array<{
              location: { start_line?: number; start_column?: number };
              message: string;
              cop_name?: string;
              severity: string;
              correctable?: boolean;
            }>;
          }
        >;
      };
      const issues: LinterIssue[] = [];

      for (const file in results.files || {}) {
        const fileData = results.files?.[file];
        if (fileData?.offenses) {
          for (const offense of fileData.offenses) {
            issues.push({
              file,
              line: offense.location.start_line || 1,
              column: offense.location.start_column,
              message: offense.message || 'RuboCop issue',
              rule: offense.cop_name,
              severity: this.mapRuboCopSeverity(offense.severity),
              fix: offense.correctable ? 'Auto-fixable with rubocop -a' : undefined,
              tool: 'rubocop',
            });
          }
        }
      }

      return issues;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Command failed')) {
        return [];
      }
      throw error;
    }
  }

  private async runGolangciLint(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const goFiles = files.filter((f) => f.path.endsWith('.go'));

    if (goFiles.length === 0) return [];

    try {
      const filePaths = goFiles.map((f) => f.path).join(' ');
      const command = `golangci-lint run --out-format json ${filePaths}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const results = JSON.parse(stdout || '[]') as {
        issues?: Array<{
          filePath?: string;
          line?: number;
          column?: number;
          text?: string;
          linter?: string;
          severity?: string;
        }>;
      };
      const issues: LinterIssue[] = [];

      for (const result of results.issues || []) {
        issues.push({
          file: result.filePath || '',
          line: result.line || 1,
          column: result.column,
          message: result.text || '',
          rule: result.linter,
          severity: this.mapGolangciSeverity(result.severity || ''),
          tool: 'golangci-lint',
        });
      }

      return issues;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Command failed')) {
        return [];
      }
      throw error;
    }
  }

  private async runRustClippy(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const rsFiles = files.filter((f) => f.path.endsWith('.rs'));

    if (rsFiles.length === 0) return [];

    try {
      const command = `cargo clippy --message-format json`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const issues: LinterIssue[] = [];
      const lines = stdout.split('\n');

      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const result = JSON.parse(line) as {
              message?: {
                spans?: Array<{
                  file_name?: string;
                  line_start?: number;
                  column_start?: number;
                }>;
                message?: string;
                code?: { code?: string };
                level?: string;
              };
            };
            if (result.message) {
              issues.push({
                file: result.message.spans?.[0]?.file_name || '',
                line: result.message.spans?.[0]?.line_start || 1,
                column: result.message.spans?.[0]?.column_start,
                message: result.message.message || '',
                rule: result.message.code?.code,
                severity: this.mapClippySeverity(result.message.level || ''),
                tool: 'rust-clippy',
              });
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }

      return issues;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Command failed')) {
        return [];
      }
      throw error;
    }
  }

  // ============================================================================
  // JavaScript/TypeScript Additional Linters
  // ============================================================================

  private async runTSLint(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const tsFiles = files.filter((f) => ['.ts', '.tsx'].some((ext) => f.path.endsWith(ext)));
    if (tsFiles.length === 0) return [];

    try {
      const filePaths = tsFiles.map((f) => f.path).join(' ');
      const command = `npx tslint --format json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'tslint');
    } catch {
      return [];
    }
  }

  private async runJSHint(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const jsFiles = files.filter((f) => ['.js', '.jsx'].some((ext) => f.path.endsWith(ext)));
    if (jsFiles.length === 0) return [];

    try {
      const filePaths = jsFiles.map((f) => f.path).join(' ');
      const command = `npx jshint --reporter=json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'jshint');
    } catch {
      return [];
    }
  }

  private async runStandard(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const jsFiles = files.filter((f) =>
      ['.js', '.jsx', '.ts', '.tsx'].some((ext) => f.path.endsWith(ext))
    );
    if (jsFiles.length === 0) return [];

    try {
      const filePaths = jsFiles.map((f) => f.path).join(' ');
      const command = `npx standard --format json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'standard');
    } catch {
      return [];
    }
  }

  private async runXO(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const jsFiles = files.filter((f) =>
      ['.js', '.jsx', '.ts', '.tsx'].some((ext) => f.path.endsWith(ext))
    );
    if (jsFiles.length === 0) return [];

    try {
      const filePaths = jsFiles.map((f) => f.path).join(' ');
      const command = `npx xo --format json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'xo');
    } catch {
      return [];
    }
  }

  private async runBiome(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const jsFiles = files.filter((f) =>
      ['.js', '.jsx', '.ts', '.tsx', '.json'].some((ext) => f.path.endsWith(ext))
    );
    if (jsFiles.length === 0) return [];

    try {
      const filePaths = jsFiles.map((f) => f.path).join(' ');
      const command = `npx @biomejs/biome check --formatter=json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'biome');
    } catch {
      return [];
    }
  }

  private async runDenoLint(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const jsFiles = files.filter((f) =>
      ['.js', '.jsx', '.ts', '.tsx'].some((ext) => f.path.endsWith(ext))
    );
    if (jsFiles.length === 0) return [];

    try {
      const filePaths = jsFiles.map((f) => f.path).join(' ');
      const command = `deno lint --json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'deno-lint');
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Python Additional Linters
  // ============================================================================

  private async runFlake8(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const pyFiles = files.filter((f) => f.path.endsWith('.py'));
    if (pyFiles.length === 0) return [];

    try {
      const filePaths = pyFiles.map((f) => f.path).join(' ');
      const command = `flake8 --format=json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'flake8');
    } catch {
      return [];
    }
  }

  private async runBlack(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const pyFiles = files.filter((f) => f.path.endsWith('.py'));
    if (pyFiles.length === 0) return [];

    try {
      const filePaths = pyFiles.map((f) => f.path).join(' ');
      const command = `black --check --diff ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const issues: LinterIssue[] = [];
      if (stdout.includes('would reformat')) {
        pyFiles.forEach((file) => {
          issues.push({
            file: file.path,
            line: 1,
            message: 'Code formatting does not match Black configuration',
            severity: 'warning',
            fix: 'Run black to auto-format',
            tool: 'black',
          });
        });
      }
      return issues;
    } catch {
      return [];
    }
  }

  private async runMypy(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const pyFiles = files.filter((f) => f.path.endsWith('.py'));
    if (pyFiles.length === 0) return [];

    try {
      const filePaths = pyFiles.map((f) => f.path).join(' ');
      const command = `mypy --show-error-codes --no-error-summary ${filePaths}`;
      const { stderr } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseTextLinterOutput(stderr, 'mypy');
    } catch {
      return [];
    }
  }

  private async runIsort(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const pyFiles = files.filter((f) => f.path.endsWith('.py'));
    if (pyFiles.length === 0) return [];

    try {
      const filePaths = pyFiles.map((f) => f.path).join(' ');
      const command = `isort --check-only --diff ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const issues: LinterIssue[] = [];
      if (stdout.includes('would change')) {
        pyFiles.forEach((file) => {
          issues.push({
            file: file.path,
            line: 1,
            message: 'Import order does not match isort configuration',
            severity: 'warning',
            fix: 'Run isort to auto-fix',
            tool: 'isort',
          });
        });
      }
      return issues;
    } catch {
      return [];
    }
  }

  private async runPydocstyle(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const pyFiles = files.filter((f) => f.path.endsWith('.py'));
    if (pyFiles.length === 0) return [];

    try {
      const filePaths = pyFiles.map((f) => f.path).join(' ');
      const command = `pydocstyle --format=json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'pydocstyle');
    } catch {
      return [];
    }
  }

  private async runPylama(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const pyFiles = files.filter((f) => f.path.endsWith('.py'));
    if (pyFiles.length === 0) return [];

    try {
      const filePaths = pyFiles.map((f) => f.path).join(' ');
      const command = `pylama --format=json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'pylama');
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Go Additional Linters
  // ============================================================================

  private async runGofmt(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const goFiles = files.filter((f) => f.path.endsWith('.go'));
    if (goFiles.length === 0) return [];

    try {
      const filePaths = goFiles.map((f) => f.path).join(' ');
      const command = `gofmt -l ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const issues: LinterIssue[] = [];
      const unformattedFiles = stdout.trim().split('\n').filter(Boolean);
      unformattedFiles.forEach((file) => {
        issues.push({
          file,
          line: 1,
          message: 'Code formatting does not match gofmt',
          severity: 'warning',
          fix: 'Run gofmt -w to auto-format',
          tool: 'gofmt',
        });
      });
      return issues;
    } catch {
      return [];
    }
  }

  private async runGoVet(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const goFiles = files.filter((f) => f.path.endsWith('.go'));
    if (goFiles.length === 0) return [];

    try {
      const filePaths = goFiles.map((f) => f.path).join(' ');
      const command = `go vet ${filePaths}`;
      const { stderr } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseTextLinterOutput(stderr, 'go-vet');
    } catch {
      return [];
    }
  }

  private async runStaticcheck(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const goFiles = files.filter((f) => f.path.endsWith('.go'));
    if (goFiles.length === 0) return [];

    try {
      const filePaths = goFiles.map((f) => f.path).join(' ');
      const command = `staticcheck -f json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'staticcheck');
    } catch {
      return [];
    }
  }

  private async runIneffassign(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const goFiles = files.filter((f) => f.path.endsWith('.go'));
    if (goFiles.length === 0) return [];

    try {
      const filePaths = goFiles.map((f) => f.path).join(' ');
      const command = `ineffassign ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseTextLinterOutput(stdout, 'ineffassign');
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Rust Additional Linters
  // ============================================================================

  private async runRustfmt(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const rsFiles = files.filter((f) => f.path.endsWith('.rs'));
    if (rsFiles.length === 0) return [];

    try {
      const filePaths = rsFiles.map((f) => f.path).join(' ');
      const command = `rustfmt --check ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const issues: LinterIssue[] = [];
      if (stdout.includes('Diff')) {
        rsFiles.forEach((file) => {
          issues.push({
            file: file.path,
            line: 1,
            message: 'Code formatting does not match rustfmt',
            severity: 'warning',
            fix: 'Run rustfmt to auto-format',
            tool: 'rustfmt',
          });
        });
      }
      return issues;
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Java Linters
  // ============================================================================

  private async runCheckstyle(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const javaFiles = files.filter((f) => f.path.endsWith('.java'));
    if (javaFiles.length === 0) return [];

    try {
      const filePaths = javaFiles.map((f) => f.path).join(' ');
      const command = `checkstyle -f json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'checkstyle');
    } catch {
      return [];
    }
  }

  private async runPMD(files: Array<{ path: string; content: string }>): Promise<LinterIssue[]> {
    const javaFiles = files.filter((f) => f.path.endsWith('.java'));
    if (javaFiles.length === 0) return [];

    try {
      const filePaths = javaFiles.map((f) => f.path).join(' ');
      const command = `pmd check -f json -d ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'pmd');
    } catch {
      return [];
    }
  }

  private async runSpotbugs(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const javaFiles = files.filter((f) => f.path.endsWith('.java'));
    if (javaFiles.length === 0) return [];

    try {
      const filePaths = javaFiles.map((f) => f.path).join(' ');
      const command = `spotbugs -textui -output spotbugs.xml ${filePaths}`;
      await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      // Parse XML output (simplified)
      return [];
    } catch {
      return [];
    }
  }

  private async runErrorProne(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const javaFiles = files.filter((f) => f.path.endsWith('.java'));
    if (javaFiles.length === 0) return [];

    try {
      const filePaths = javaFiles.map((f) => f.path).join(' ');
      const command = `javac -Xplugin:ErrorProne ${filePaths}`;
      const { stderr } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseTextLinterOutput(stderr, 'error-prone');
    } catch {
      return [];
    }
  }

  // ============================================================================
  // General Linters
  // ============================================================================

  private async runShellCheck(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const shellFiles = files.filter((f) =>
      ['.sh', '.bash', '.zsh', '.fish'].some((ext) => f.path.endsWith(ext))
    );
    if (shellFiles.length === 0) return [];

    try {
      const filePaths = shellFiles.map((f) => f.path).join(' ');
      const command = `shellcheck -f json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'shellcheck');
    } catch {
      return [];
    }
  }

  private async runHadolint(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const dockerFiles = files.filter((f) =>
      ['Dockerfile', 'dockerfile', '.dockerfile'].some((name) => f.path.includes(name))
    );
    if (dockerFiles.length === 0) return [];

    try {
      const filePaths = dockerFiles.map((f) => f.path).join(' ');
      const command = `hadolint --format json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'hadolint');
    } catch {
      return [];
    }
  }

  private async runMarkdownlint(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const mdFiles = files.filter((f) => f.path.endsWith('.md'));
    if (mdFiles.length === 0) return [];

    try {
      const filePaths = mdFiles.map((f) => f.path).join(' ');
      const command = `npx markdownlint --json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'markdownlint');
    } catch {
      return [];
    }
  }

  private async runYamllint(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const yamlFiles = files.filter((f) => ['.yaml', '.yml'].some((ext) => f.path.endsWith(ext)));
    if (yamlFiles.length === 0) return [];

    try {
      const filePaths = yamlFiles.map((f) => f.path).join(' ');
      const command = `yamllint -f json ${filePaths}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.parseJSONLinterOutput(stdout, 'yamllint');
    } catch {
      return [];
    }
  }

  private async runJsonlint(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    const jsonFiles = files.filter((f) => f.path.endsWith('.json'));
    if (jsonFiles.length === 0) return Promise.resolve([]);

    const issues: LinterIssue[] = [];
    for (const file of jsonFiles) {
      try {
        JSON.parse(file.content);
      } catch (error) {
        issues.push({
          file: file.path,
          line: 1,
          message: error instanceof Error ? error.message : 'Invalid JSON',
          severity: 'error',
          tool: 'jsonlint',
        });
      }
    }
    return Promise.resolve(issues);
  }

  // ============================================================================
  // Helper Methods for Parsing
  // ============================================================================

  private parseJSONLinterOutput(output: string, tool: LinterTool): LinterIssue[] {
    const issues: LinterIssue[] = [];
    try {
      const results = JSON.parse(output || '[]') as Array<{
        file?: string;
        filePath?: string;
        path?: string;
        line?: number;
        lineNumber?: number;
        column?: number;
        columnNumber?: number;
        message?: string;
        msg?: string;
        text?: string;
        rule?: string;
        ruleId?: string;
        code?: string;
        severity?: string;
        level?: string;
      }>;
      // Generic JSON parser - adapt based on tool format
      if (Array.isArray(results)) {
        results.forEach((result) => {
          issues.push({
            file: result.file || result.filePath || result.path || '',
            line: result.line || result.lineNumber || 1,
            column: result.column || result.columnNumber,
            message: result.message || result.msg || result.text || '',
            rule: result.rule || result.ruleId || result.code,
            severity: this.mapGenericSeverity(result.severity || result.level || ''),
            tool,
          });
        });
      }
    } catch {
      // If JSON parsing fails, return empty array
    }
    return issues;
  }

  private parseTextLinterOutput(output: string, tool: LinterTool): LinterIssue[] {
    const issues: LinterIssue[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/^(.+?):(\d+):(\d+):\s*(.+)$/);
      if (match) {
        const [, file, lineNum, col, message] = match;
        if (file && lineNum && col && message) {
          issues.push({
            file,
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            message: message.trim(),
            severity: 'warning',
            tool,
          });
        }
      }
    }
    return issues;
  }

  private mapGenericSeverity(severity: string): Severity {
    const lower = severity.toLowerCase();
    if (lower.includes('error') || lower.includes('critical') || lower.includes('fatal')) {
      return 'error';
    }
    if (lower.includes('warning') || lower.includes('warn')) {
      return 'warning';
    }
    return 'info';
  }

  private async runCustomLinter(
    files: Array<{ path: string; content: string }>
  ): Promise<LinterIssue[]> {
    if (!this.config.customCommands) return [];

    const issues: LinterIssue[] = [];

    for (const [toolName, command] of Object.entries(this.config.customCommands)) {
      try {
        const filePaths = files.map((f) => f.path).join(' ');
        const fullCommand = command.replace('{files}', filePaths);

        await execAsync(fullCommand, {
          cwd: this.workingDir,
          maxBuffer: 10 * 1024 * 1024,
        });

        // Custom parsers would need to be implemented per tool
        // For now, return empty array
        console.warn(`Custom linter ${toolName} output not parsed`);
      } catch (error) {
        console.warn(`Custom linter ${toolName} failed:`, error);
      }
    }

    return issues;
  }

  // ============================================================================
  // Private Methods - Severity Mapping
  // ============================================================================

  private mapESLintSeverity(severity: number): Severity {
    if (severity === 2) return 'error';
    if (severity === 1) return 'warning';
    return 'info';
  }

  private mapPylintSeverity(type: string): Severity {
    if (type === 'error' || type === 'fatal') return 'error';
    if (type === 'warning') return 'warning';
    return 'info';
  }

  private mapRuboCopSeverity(severity: string): Severity {
    if (severity === 'error') return 'error';
    if (severity === 'warning') return 'warning';
    return 'info';
  }

  private mapGolangciSeverity(severity: string): Severity {
    if (severity === 'error') return 'error';
    if (severity === 'warning') return 'warning';
    return 'info';
  }

  private mapClippySeverity(level: string): Severity {
    if (level === 'error') return 'error';
    if (level === 'warning') return 'warning';
    return 'info';
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private shouldIgnore(path: string): boolean {
    const ignorePatterns = this.config.ignorePatterns || [];
    const defaultIgnore = ['node_modules', '.git', 'dist', 'build', '__tests__', '*.test.*'];

    const allPatterns = [...defaultIgnore, ...ignorePatterns];

    return allPatterns.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(path);
      }
      return path.includes(pattern);
    });
  }
}
// ============================================================================
// Factory Function
// ============================================================================

export function createLinterIntegration(config?: LinterConfig): LinterIntegration {
  return new LinterIntegration(config);
}
