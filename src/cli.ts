#!/usr/bin/env node

import { Command } from 'commander';
import { PRReviewer } from './reviewer';
import { ConfigLoader } from './config';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';

const program = new Command();

program
  .name('code-detective')
  .description('AST-based PR reviewer using chunkyyy for semantic code chunking')
  .version('1.0.0');

program
  .command('review')
  .description('Review a PR by branch name')
  .requiredOption('-b, --branch <branch>', 'Target branch to review')
  .option('--base <base>', 'Base branch (default: main)')
  .option('-c, --config <path>', 'Path to config file')
  .option('--no-comments', 'Skip posting comments to PR')
  .option('--repo <path>', 'Path to repository (default: current directory)')
  .action(async (options) => {
    try {
      const config = ConfigLoader.load(options.config);
      ConfigLoader.validate(config);

      const repoPath = options.repo || process.cwd();
      const reviewer = new PRReviewer(config, repoPath);

      const result = await reviewer.reviewPR(
        options.branch,
        options.base,
        options.comments !== false
      );

      if (result.comments.length === 0) {
        console.log(chalk.green('\n✅ No issues found!'));
      } else {
        console.log(chalk.yellow('\n⚠️  Review completed with findings'));
      }

      process.exit(result.stats.errors > 0 ? 1 : 0);
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      if (error.stack && process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('review-file')
  .description('Review a specific file')
  .requiredOption('-f, --file <path>', 'File path to review')
  .requiredOption('-b, --branch <branch>', 'Branch to review')
  .option('--start-line <number>', 'Start line number', parseInt)
  .option('--end-line <number>', 'End line number', parseInt)
  .option('-c, --config <path>', 'Path to config file')
  .option('--repo <path>', 'Path to repository (default: current directory)')
  .action(async (options) => {
    try {
      const config = ConfigLoader.load(options.config);
      ConfigLoader.validate(config);

      const repoPath = options.repo || process.cwd();
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
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      if (error.stack && process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration file')
  .option('-c, --config <path>', 'Path to config file (default: code-detective.config.json)')
  .action(async (options) => {
    const configPath = options.config || 'code-detective.config.json';

    if (existsSync(configPath)) {
      console.log(chalk.yellow(`Config file already exists: ${configPath}`));
      return;
    }

    const defaultConfig = {
      aiProvider: 'openai',
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: 'gpt-4-turbo-preview',
      },
      claude: {
        apiKey: process.env.CLAUDE_API_KEY || '',
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
        token: process.env.GITHUB_TOKEN || '',
      },
    };

    const fs = await import('fs/promises');
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));

    console.log(chalk.green(`✅ Created config file: ${configPath}`));
    console.log(chalk.yellow('Please update the configuration with your settings.'));
  });

program.parse();
