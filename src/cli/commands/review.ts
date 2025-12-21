/**
 * Review Command - AI-powered code review
 *
 * Supports:
 * - Branch review: --branch feature/my-branch --base main
 * - PR review: --pr 123
 * - Path review: --path ./src (fallback)
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import ora from 'ora';
import { resolve } from 'path';
import { createPerformanceAnalyzer, createSecurityAnalyzer } from '../../analyzers';
import { createAutoFix } from '../../autofix';
import { Config, ReviewComment, ReviewResult } from '../../types';
import { getFiles, loadConfig, SherlockConfig } from '../utils';

// Types for lazy-loaded modules
interface PRReviewerClass {
  new (
    config: Config,
    repoPath?: string
  ): {
    reviewPR(branch: string, post: boolean, base?: string): Promise<ReviewResult>;
  };
}

interface ConfigLoaderClass {
  load(path?: string): Config;
}

interface GitServiceClass {
  new (repoPath?: string): {
    getCurrentBranch(): Promise<string>;
  };
}

// Lazy-loaded modules cache
let _PRReviewer: PRReviewerClass | null = null;
let _ConfigLoader: ConfigLoaderClass | null = null;
let _GitService: GitServiceClass | null = null;

async function loadReviewerDeps(): Promise<{
  PRReviewer: PRReviewerClass;
  ConfigLoader: ConfigLoaderClass;
  GitService: GitServiceClass;
}> {
  if (!_PRReviewer) {
    const reviewerModule = await import('../../reviewer');
    const configModule = await import('../../config');
    const gitModule = await import('../../git');
    _PRReviewer = reviewerModule.PRReviewer as PRReviewerClass;
    _ConfigLoader = configModule.ConfigLoader as ConfigLoaderClass;
    _GitService = gitModule.GitService as GitServiceClass;
  }
  return {
    PRReviewer: _PRReviewer,
    ConfigLoader: _ConfigLoader!,
    GitService: _GitService!,
  };
}

interface ReviewOptions {
  path?: string;
  branch?: string;
  base?: string;
  pr?: string;
  model?: string;
  output?: string;
  files?: string[];
  ignore?: string[];
  config?: string;
  incremental?: boolean;
  fix?: boolean;
  strict?: boolean;
  post?: boolean;
}

interface ReviewIssue {
  file: string;
  line: number;
  severity: string;
  message: string;
  type: string;
  suggestion?: string;
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const spinner = ora('Initializing review...').start();

  try {
    // Determine review mode
    if (options.branch || options.pr) {
      // Branch/PR review mode - uses PRReviewer with chunkyyy + AI
      await runBranchReview(options, spinner);
    } else {
      // Path review mode - uses analyzers (security + performance)
      await runPathReview(options, spinner);
    }
  } catch (error) {
    spinner.fail(`Review failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Branch/PR Review - Full AI review with chunkyyy
 */
async function runBranchReview(options: ReviewOptions, spinner: ora.Ora): Promise<void> {
  // Lazy load heavy dependencies
  const { PRReviewer, ConfigLoader, GitService } = await loadReviewerDeps();

  const repoPath = process.cwd();
  const git = new GitService(repoPath);

  // Determine branch to review
  let targetBranch: string;
  const baseBranch = options.base || 'main';

  if (options.pr) {
    // Fetch PR branch
    spinner.text = `Fetching PR #${options.pr}...`;
    targetBranch = await fetchPRBranch(options.pr);
  } else if (options.branch) {
    targetBranch = options.branch;
  } else {
    targetBranch = await git.getCurrentBranch();
  }

  spinner.text = `Reviewing branch: ${targetBranch} vs ${baseBranch}`;

  // Load config
  const config = ConfigLoader.load(options.config);

  // Override config with CLI options
  if (options.pr) {
    config.pr = { ...config.pr, number: parseInt(options.pr, 10) };
  }

  // Create reviewer
  const reviewer = new PRReviewer(config, repoPath);

  spinner.stop();
  console.log(
    chalk.blue(`\n🔍 Reviewing branch: ${chalk.bold(targetBranch)} vs ${chalk.bold(baseBranch)}\n`)
  );

  // Run review
  const result = await reviewer.reviewPR(targetBranch, options.post || false, baseBranch);

  // Output results
  if (options.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.output === 'markdown') {
    console.log(formatBranchReviewMarkdown(result, targetBranch, baseBranch));
  } else {
    printBranchReview(result, targetBranch, baseBranch);
  }

  // Exit with error if strict mode and issues found
  if (options.strict && result.comments.length > 0) {
    process.exit(1);
  }
}

/**
 * Fetch PR branch from GitHub
 */
async function fetchPRBranch(prNumber: string): Promise<string> {
  const branchName = `pr-${prNumber}`;

  // Use simple-git directly to fetch PR
  const simpleGitModule = await import('simple-git');
  const simpleGit = simpleGitModule.default;
  const git = simpleGit(process.cwd());

  try {
    await git.fetch(['origin', `pull/${prNumber}/head:${branchName}`]);
  } catch {
    console.log(chalk.gray(`Using existing branch ${branchName}`));
  }

  return branchName;
}

/**
 * Print branch review results to console
 */
function printBranchReview(
  result: {
    comments: ReviewComment[];
    summary: string;
    stats: { errors: number; warnings: number; suggestions: number };
  },
  targetBranch: string,
  baseBranch: string
): void {
  console.log(chalk.bold.blue('\n═══════════════════════════════════════'));
  console.log(chalk.bold.blue('🔍 AI Code Review Results'));
  console.log(chalk.bold.blue('═══════════════════════════════════════\n'));

  console.log(chalk.gray(`Branch: ${targetBranch} → ${baseBranch}`));
  console.log(chalk.gray(`Summary: ${result.summary}\n`));

  if (result.comments.length === 0) {
    console.log(chalk.green('✅ No issues found!'));
    return;
  }

  // Group by file
  const byFile = new Map<string, ReviewComment[]>();
  for (const comment of result.comments) {
    const existing = byFile.get(comment.file) || [];
    existing.push(comment);
    byFile.set(comment.file, existing);
  }

  for (const [file, comments] of byFile) {
    console.log(chalk.bold(`📄 ${file}`));
    for (const comment of comments) {
      const icon =
        comment.severity === 'error' ? '🔴' : comment.severity === 'warning' ? '🟡' : '💡';
      const color =
        comment.severity === 'error'
          ? chalk.red
          : comment.severity === 'warning'
            ? chalk.yellow
            : chalk.cyan;
      console.log(`  ${icon} Line ${comment.line}: ${color(comment.body)}`);
    }
    console.log('');
  }

  // Summary
  console.log(chalk.bold('📊 Summary:'));
  console.log(
    `  ${chalk.red(`🔴 Errors: ${result.stats.errors}`)} | ${chalk.yellow(`🟡 Warnings: ${result.stats.warnings}`)} | ${chalk.cyan(`💡 Suggestions: ${result.stats.suggestions}`)}`
  );
}

/**
 * Format branch review as markdown
 */
function formatBranchReviewMarkdown(
  result: {
    comments: ReviewComment[];
    summary: string;
    stats: { errors: number; warnings: number; suggestions: number };
  },
  targetBranch: string,
  baseBranch: string
): string {
  const lines: string[] = [];
  lines.push('# 🔍 AI Code Review\n');
  lines.push(`**Branch:** \`${targetBranch}\` → \`${baseBranch}\`\n`);
  lines.push(`**Summary:** ${result.summary}\n`);

  if (result.comments.length === 0) {
    lines.push('✅ No issues found!\n');
    return lines.join('\n');
  }

  // Group by file
  const byFile = new Map<string, ReviewComment[]>();
  for (const comment of result.comments) {
    const existing = byFile.get(comment.file) || [];
    existing.push(comment);
    byFile.set(comment.file, existing);
  }

  for (const [file, comments] of byFile) {
    lines.push(`## 📄 \`${file}\`\n`);
    for (const comment of comments) {
      const icon =
        comment.severity === 'error' ? '🔴' : comment.severity === 'warning' ? '🟡' : '💡';
      lines.push(`- ${icon} **Line ${comment.line}**: ${comment.body}`);
    }
    lines.push('');
  }

  lines.push('## 📊 Summary\n');
  lines.push(`| Type | Count |`);
  lines.push(`|------|-------|`);
  lines.push(`| 🔴 Errors | ${result.stats.errors} |`);
  lines.push(`| 🟡 Warnings | ${result.stats.warnings} |`);
  lines.push(`| 💡 Suggestions | ${result.stats.suggestions} |`);

  return lines.join('\n');
}

/**
 * Path Review - Quick scan using analyzers
 */
async function runPathReview(options: ReviewOptions, spinner: ora.Ora): Promise<void> {
  const targetPath = options.path || '.';

  // Load configuration
  const configPath = options.config ? resolve(options.config) : '.sherlockrc.json';
  const config = loadConfig(configPath, options as unknown as Partial<SherlockConfig>);

  spinner.text = 'Scanning files...';

  // Get files to review
  const files = await getFiles(targetPath, {
    specific: options.files,
    ignore: options.ignore || config.ignore || [],
  });

  if (files.length === 0) {
    spinner.warn('No files found to review');
    return;
  }

  spinner.info(`Found ${files.length} files to review`);

  // Load file contents
  const fileContents = files
    .map((file) => {
      const fullPath = resolve(targetPath, file);
      return {
        path: file,
        content: existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : '',
      };
    })
    .filter((f) => f.content.length > 0);

  // Run security analysis
  spinner.text = 'Running security analysis...';
  const securityAnalyzer = createSecurityAnalyzer({ minSeverity: 'warning' });
  const securityResult = securityAnalyzer.analyze(fileContents);

  // Run performance analysis
  spinner.text = 'Running performance analysis...';
  const perfAnalyzer = createPerformanceAnalyzer({ minImpact: 'medium' });
  const perfResult = perfAnalyzer.analyze(fileContents);

  // Combine results
  const allIssues: ReviewIssue[] = [
    ...securityResult.issues.map((i) => ({
      file: i.file,
      line: i.line,
      severity: i.severity,
      message: i.message,
      type: 'security',
      suggestion: i.suggestion,
    })),
    ...perfResult.issues.map((i) => ({
      file: i.file,
      line: i.line,
      severity: i.severity,
      message: i.message,
      type: 'performance',
      suggestion: i.suggestion,
    })),
  ];

  // Generate fixes if requested
  const fixes: Array<{ file: string; suggestion: string }> = [];
  if (options.fix && allIssues.length > 0) {
    spinner.text = 'Generating fix suggestions...';
    const autofix = createAutoFix();

    const issuesByFile = new Map<string, ReviewIssue[]>();
    for (const issue of allIssues) {
      const existing = issuesByFile.get(issue.file) || [];
      existing.push(issue);
      issuesByFile.set(issue.file, existing);
    }

    for (const [file, fileIssues] of issuesByFile) {
      const fullPath = resolve(targetPath, file);
      if (!existsSync(fullPath)) continue;

      const content = readFileSync(fullPath, 'utf-8');
      const fixResult = autofix.generateFixes({
        filePath: file,
        fileContent: content,
        language: getLanguage(file),
        comments: fileIssues.map((i) => ({
          file: i.file,
          line: i.line,
          body: i.message,
          severity: i.severity as 'error' | 'warning' | 'info',
        })),
      });

      for (const suggestion of fixResult.suggestions) {
        fixes.push({
          file,
          suggestion: autofix.formatAsGitHubSuggestion(suggestion.fix),
        });
      }
    }
  }

  spinner.stop();

  // Output results
  if (options.output === 'json') {
    console.log(
      JSON.stringify({ security: securityResult, performance: perfResult, fixes }, null, 2)
    );
  } else if (options.output === 'markdown') {
    console.log(formatPathReviewMarkdown(allIssues, perfResult.score, fixes));
  } else {
    printPathReview(allIssues, perfResult.score, fixes);
  }

  // Exit with error if strict mode and issues found
  if (options.strict && allIssues.length > 0) {
    process.exit(1);
  }
}

function printPathReview(
  issues: ReviewIssue[],
  perfScore: number,
  fixes: Array<{ file: string; suggestion: string }>
): void {
  console.log('\n' + chalk.bold.blue('🔍 Code Review Results\n'));

  const scoreEmoji = perfScore >= 80 ? '🟢' : perfScore >= 60 ? '🟡' : '🔴';
  const scoreColor = perfScore >= 80 ? chalk.green : perfScore >= 60 ? chalk.yellow : chalk.red;
  console.log(chalk.bold(`Performance Score: ${scoreEmoji} ${scoreColor(perfScore + '/100')}\n`));

  if (issues.length === 0) {
    console.log(chalk.green('✅ No issues found!'));
    return;
  }

  const byFile = new Map<string, ReviewIssue[]>();
  for (const issue of issues) {
    const existing = byFile.get(issue.file) || [];
    existing.push(issue);
    byFile.set(issue.file, existing);
  }

  for (const [file, fileIssues] of byFile) {
    console.log(chalk.bold(`📄 ${file}`));
    for (const issue of fileIssues) {
      const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🟢';
      const color =
        issue.severity === 'error'
          ? chalk.red
          : issue.severity === 'warning'
            ? chalk.yellow
            : chalk.gray;
      const typeIcon = issue.type === 'security' ? '🔒' : '⚡';
      console.log(`  ${icon} ${typeIcon} Line ${issue.line}: ${color(issue.message)}`);
    }
    console.log('');
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const info = issues.length - errors - warnings;

  console.log(chalk.bold('📊 Summary:'));
  console.log(
    `  ${chalk.red(`🔴 Errors: ${errors}`)} | ${chalk.yellow(`🟡 Warnings: ${warnings}`)} | ${chalk.gray(`🟢 Info: ${info}`)}`
  );
  console.log(
    `  🔒 Security: ${issues.filter((i) => i.type === 'security').length} | ⚡ Performance: ${issues.filter((i) => i.type === 'performance').length}`
  );

  if (fixes.length > 0) {
    console.log(chalk.bold(`\n🔧 ${fixes.length} fix suggestion(s) available`));
  }
}

function formatPathReviewMarkdown(
  issues: ReviewIssue[],
  perfScore: number,
  _fixes: Array<{ file: string; suggestion: string }>
): string {
  const lines: string[] = [];
  lines.push('# 🔍 Code Review Results\n');
  lines.push(`## Performance Score: ${perfScore}/100\n`);

  if (issues.length === 0) {
    lines.push('✅ No issues found!\n');
    return lines.join('\n');
  }

  const byFile = new Map<string, ReviewIssue[]>();
  for (const issue of issues) {
    const existing = byFile.get(issue.file) || [];
    existing.push(issue);
    byFile.set(issue.file, existing);
  }

  for (const [file, fileIssues] of byFile) {
    lines.push(`## 📄 \`${file}\`\n`);
    for (const issue of fileIssues) {
      const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🟢';
      const typeIcon = issue.type === 'security' ? '🔒' : '⚡';
      lines.push(`- ${icon} ${typeIcon} **Line ${issue.line}**: ${issue.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    vue: 'vue',
    py: 'python',
    go: 'go',
  };
  return map[ext] || 'unknown';
}
