#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { ConfigLoader } from './config';
import { PRReviewer } from './reviewer';
import { CodeSherlockError, DefaultConfig } from './types';

// ============================================================================
// Types
// ============================================================================

interface ReviewOptions {
  branch: string;
  base?: string;
  config?: string;
  comments: boolean;
  repo?: string;
}

interface ReviewFileOptions {
  file: string;
  branch: string;
  startLine?: number;
  endLine?: number;
  config?: string;
  repo?: string;
}

interface InitOptions {
  config?: string;
}

// ============================================================================
// CLI Setup
// ============================================================================

const program = new Command();

program
  .name('code-sherlock')
  .description('AST-based PR reviewer using chunkyyy for semantic code chunking')
  .version('1.0.3');

// ============================================================================
// Review Command
// ============================================================================

program
  .command('review')
  .description(
    'Review a PR by branch name - reviews only changes in target branch compared to base'
  )
  .requiredOption('-b, --branch <branch>', 'Target branch to review (feature/PR branch)')
  .option(
    '--base <branch>',
    'Base branch to compare against (overrides config, e.g., main, develop)'
  )
  .option('-c, --config <path>', 'Path to config file')
  .option('--no-comments', 'Skip posting comments to PR')
  .option('--repo <path>', 'Path to repository (default: current directory)')
  .action(async (options: ReviewOptions) => {
    try {
      const config = ConfigLoader.load(options.config);
      ConfigLoader.validate(config);

      const repoPath = options.repo ?? process.cwd();
      const reviewer = new PRReviewer(config, repoPath);

      const result = await reviewer.reviewPR(options.branch, options.comments, options.base);

      if (result.comments.length === 0) {
        console.log(chalk.green('\n✅ No issues found!'));
      } else {
        console.log(chalk.yellow('\n⚠️  Review completed with findings'));
      }

      process.exit(result.stats.errors > 0 ? 1 : 0);
    } catch (error) {
      handleError(error);
    }
  });

// ============================================================================
// Review File Command
// ============================================================================

program
  .command('review-file')
  .description('Review a specific file')
  .requiredOption('-f, --file <path>', 'File path to review')
  .requiredOption('-b, --branch <branch>', 'Branch to review')
  .option('--start-line <number>', 'Start line number', parseInt)
  .option('--end-line <number>', 'End line number', parseInt)
  .option('-c, --config <path>', 'Path to config file')
  .option('--repo <path>', 'Path to repository (default: current directory)')
  .action(async (options: ReviewFileOptions) => {
    try {
      const config = ConfigLoader.load(options.config);
      ConfigLoader.validate(config);

      const repoPath = options.repo ?? process.cwd();
      const reviewer = new PRReviewer(config, repoPath);

      const result = await reviewer.reviewFile(
        options.file,
        options.branch,
        options.startLine,
        options.endLine
      );

      if (result.comments.length === 0) {
        console.log(chalk.green('\n✅ No issues found!'));
      } else {
        console.log(chalk.yellow('\n⚠️  Review completed with findings'));
      }

      process.exit(result.stats.errors > 0 ? 1 : 0);
    } catch (error) {
      handleError(error);
    }
  });

// ============================================================================
// Init Command
// ============================================================================

program
  .command('init')
  .description('Initialize configuration file')
  .option('-c, --config <path>', 'Path to config file (default: code-sherlock.config.json)')
  .action(async (options: InitOptions) => {
    const configPath = options.config ?? 'code-sherlock.config.json';

    if (existsSync(configPath)) {
      console.log(chalk.yellow(`Config file already exists: ${configPath}`));
      return;
    }

    const defaultConfig: DefaultConfig = {
      aiProvider: 'openai',
      openai: {
        apiKey: process.env.OPENAI_API_KEY ?? '',
        model: 'gpt-4-turbo-preview',
      },
      claude: {
        apiKey: process.env.CLAUDE_API_KEY ?? '',
        model: 'claude-3-5-sonnet-20241022',
      },
      globalRules: [
        'Check for security vulnerabilities',
        'Ensure proper error handling',
        'Follow best practices and coding standards',
        'Check for performance issues',
      ],
      repository: {
        owner: 'your-org',
        repo: 'your-repo',
        baseBranch: 'main',
      },
      pr: {
        number: 0,
      },
      github: {
        token: process.env.GITHUB_TOKEN ?? '',
      },
    };

    await writeFile(configPath, JSON.stringify(defaultConfig, null, 2));

    console.log(chalk.green(`✅ Created config file: ${configPath}`));
    console.log(chalk.yellow('Please update the configuration with your settings.'));
  });

// ============================================================================
// Error Handler
// ============================================================================

function handleError(error: unknown): never {
  if (error instanceof CodeSherlockError) {
    console.error(chalk.red(`\n❌ ${error.name}: ${error.message}`));
    if (error.cause && process.env.DEBUG) {
      console.error(chalk.gray('Caused by:'), error.cause);
    }
  } else if (error instanceof Error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    if (error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
  } else {
    console.error(chalk.red(`\n❌ Unknown error: ${String(error)}`));
  }

  process.exit(1);
}

// ============================================================================
// Parse CLI
// ============================================================================

program.parse();
