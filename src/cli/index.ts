#!/usr/bin/env node
/**
 * Code-Sherlock CLI
 *
 * Usage:
 *   sherlock review [options]        # Review code changes
 *   sherlock security [options]      # Run security scan
 *   sherlock performance [options]   # Run performance analysis
 *   sherlock init                    # Initialize config file
 */

import { Command } from 'commander';
import { version } from '../../package.json';
import { initCommand } from './commands/init';
import { performanceCommand } from './commands/performance';
import { reviewCommand } from './commands/review';
import { securityCommand } from './commands/security';

const program = new Command();

program.name('sherlock').description('🔍 AI-Powered Code Review CLI').version(version);

// Review command
program
  .command('review')
  .description('Review code changes with AI')
  .option('-p, --path <path>', 'Path to analyze (for quick scan)')
  .option('--branch <branch>', 'Branch to review (uses chunkyyy + AI)')
  .option('--pr <number>', 'PR number to review (fetches from GitHub)')
  .option('-b, --base <branch>', 'Base branch for comparison', 'main')
  .option('-m, --model <model>', 'AI model to use (openai, claude)', 'openai')
  .option('-o, --output <format>', 'Output format (console, json, markdown)', 'console')
  .option('--files <files...>', 'Specific files to review')
  .option('--ignore <patterns...>', 'Patterns to ignore')
  .option('--config <file>', 'Config file path', '.sherlockrc.json')
  .option('--incremental', 'Only review changed files since last review')
  .option('--fix', 'Generate fix suggestions')
  .option('--post', 'Post comments to PR (requires --pr)')
  .option('--strict', 'Fail on any issues found')
  .action(reviewCommand);

// Security command
program
  .command('security')
  .description('Run security vulnerability scan')
  .option('-p, --path <path>', 'Path to scan', '.')
  .option('-o, --output <format>', 'Output format (console, json, markdown)', 'console')
  .option('--files <files...>', 'Specific files to scan')
  .option('--ignore <patterns...>', 'Patterns to ignore')
  .option('--min-severity <level>', 'Minimum severity to report (info, warning, error)', 'warning')
  .option('--checks <checks...>', 'Specific checks to run')
  .option('--sarif <file>', 'Output SARIF format to file')
  .option('--strict', 'Fail on any issues found')
  .action(securityCommand);

// Performance command
program
  .command('performance')
  .alias('perf')
  .description('Run performance analysis')
  .option('-p, --path <path>', 'Path to analyze', '.')
  .option('-o, --output <format>', 'Output format (console, json, markdown)', 'console')
  .option('--files <files...>', 'Specific files to analyze')
  .option('--ignore <patterns...>', 'Patterns to ignore')
  .option('--focus <area>', 'Focus area (frontend, backend, both)', 'both')
  .option('--min-impact <level>', 'Minimum impact to report (low, medium, high)', 'low')
  .option('--threshold <score>', 'Minimum score threshold (0-100)', '0')
  .option('--strict', 'Fail if score below threshold')
  .action(performanceCommand);

// Init command
program
  .command('init')
  .description('Initialize configuration file')
  .option('-f, --force', 'Overwrite existing config')
  .option('--template <template>', 'Config template (default, strict, minimal)', 'default')
  .action(initCommand);

// Parse and run
program.parse();
