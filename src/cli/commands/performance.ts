/**
 * Performance Command - Performance analysis
 */

import { resolve } from 'path';
import { readFileSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import {
  createPerformanceAnalyzer,
  PerformanceAnalysisResult,
  PerformanceIssue,
} from '../../analyzers';
import { getFiles } from '../utils';

interface PerformanceOptions {
  path: string;
  output: string;
  files?: string[];
  ignore?: string[];
  focus: string;
  minImpact: string;
  threshold: string;
  strict?: boolean;
}

export async function performanceCommand(options: PerformanceOptions): Promise<void> {
  const spinner = ora('Initializing performance analysis...').start();

  try {
    spinner.text = 'Analyzing code for performance issues...';

    // Get files to analyze
    const files = await getFiles(options.path, {
      specific: options.files,
      ignore: options.ignore || [],
    });

    if (files.length === 0) {
      spinner.warn('No files found to analyze');
      return;
    }

    spinner.info(`Analyzing ${files.length} files for performance issues...`);

    // Create analyzer with options
    const analyzer = createPerformanceAnalyzer({
      focus: options.focus as 'frontend' | 'backend' | 'both',
      minImpact: options.minImpact as 'low' | 'medium' | 'high',
    });

    // Load file contents
    const fileContents = files.map((file) => ({
      path: file,
      content: readFileSync(resolve(options.path, file), 'utf-8'),
    }));

    // Run analysis
    const result = analyzer.analyze(fileContents);

    spinner.stop();

    // Output results
    if (options.output === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (options.output === 'markdown') {
      console.log(analyzer.formatAsMarkdown(result));
    } else {
      printConsoleResults(result);
    }

    // Check threshold
    const threshold = parseInt(options.threshold, 10);
    if (options.strict && result.score < threshold) {
      console.log(
        chalk.red(`\n❌ Performance score ${result.score} is below threshold ${threshold}`)
      );
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(
      `Performance analysis failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

function printConsoleResults(result: PerformanceAnalysisResult): void {
  console.log('\n' + chalk.bold.cyan('⚡ Performance Analysis Results\n'));

  // Score display
  const scoreEmoji = result.score >= 80 ? '🟢' : result.score >= 60 ? '🟡' : '🔴';
  const scoreColor =
    result.score >= 80 ? chalk.green : result.score >= 60 ? chalk.yellow : chalk.red;

  console.log(
    chalk.bold(`Performance Score: ${scoreEmoji} ${scoreColor(result.score + '/100')}\n`)
  );

  // Progress bar
  const filled = Math.floor(result.score / 5);
  const empty = 20 - filled;
  const bar = scoreColor('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  console.log(`  [${bar}]\n`);

  if (result.issues.length === 0) {
    console.log(chalk.green('✅ No performance issues detected!'));
    return;
  }

  // Group by impact
  const high = result.issues.filter((i) => i.impact === 'high');
  const medium = result.issues.filter((i) => i.impact === 'medium');
  const low = result.issues.filter((i) => i.impact === 'low');

  if (high.length > 0) {
    console.log(chalk.bold.red('🔴 HIGH IMPACT'));
    printIssueGroup(high);
  }

  if (medium.length > 0) {
    console.log(chalk.bold.yellow('🟡 MEDIUM IMPACT'));
    printIssueGroup(medium);
  }

  if (low.length > 0) {
    console.log(chalk.bold.gray('🟢 LOW IMPACT'));
    printIssueGroup(low);
  }

  // Summary
  console.log(chalk.bold('\n📊 Summary:'));
  console.log(
    `  ${chalk.red(`High: ${high.length}`)} | ${chalk.yellow(`Medium: ${medium.length}`)} | ${chalk.gray(`Low: ${low.length}`)}`
  );
  console.log(`  Files analyzed: ${result.filesAnalyzed}`);
  console.log(`  Time: ${result.analysisTime}ms`);

  // Recommendations
  if (high.length > 0) {
    console.log(chalk.bold('\n💡 Top Recommendations:'));
    const topIssues = high.slice(0, 3);
    for (const issue of topIssues) {
      console.log(chalk.yellow(`  → ${issue.suggestion}`));
    }
  }
}

function printIssueGroup(issues: PerformanceIssue[]): void {
  for (const issue of issues) {
    console.log(`\n  ${chalk.bold(issue.type.toUpperCase())}`);
    console.log(`  📁 ${issue.file}:${issue.line}`);
    console.log(`  💬 ${issue.message}`);
    console.log(`  📈 ${chalk.cyan(issue.estimatedGain)}`);
    if (issue.snippet) {
      console.log(chalk.gray(`  > ${issue.snippet.substring(0, 80)}...`));
    }
    if (issue.suggestion) {
      console.log(chalk.green(`  💡 Fix: ${issue.suggestion}`));
    }
  }
  console.log('');
}
