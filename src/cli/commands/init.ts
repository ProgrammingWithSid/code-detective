/**
 * Init Command - Initialize configuration
 */

import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';

interface InitOptions {
  force?: boolean;
  template: string;
}

const TEMPLATES = {
  default: {
    $schema: 'https://code-sherlock.dev/schema.json',
    version: '1.0',

    // AI Configuration
    ai: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.3,
    },

    // Review Settings
    review: {
      enabled: true,
      incremental: true,
      autoFix: true,
      rules: {
        complexity: 'warn',
        documentation: 'info',
        naming: 'warn',
        security: 'error',
        performance: 'warn',
      },
    },

    // Security Settings
    security: {
      enabled: true,
      minSeverity: 'warning',
      checks: [
        'sql-injection',
        'xss',
        'command-injection',
        'hardcoded-secret',
        'path-traversal',
        'weak-crypto',
      ],
      sarif: false,
    },

    // Performance Settings
    performance: {
      enabled: true,
      minImpact: 'medium',
      focus: 'both',
      threshold: 70,
    },

    // File Patterns
    include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],

    ignore: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      '__tests__/**',
    ],

    // Output Settings
    output: {
      format: 'console',
      colors: true,
      verbose: false,
    },

    // GitHub Integration
    github: {
      autoReview: true,
      postComments: true,
      statusCheck: true,
      labels: {
        security: 'security',
        performance: 'performance',
      },
    },
  },

  strict: {
    $schema: 'https://code-sherlock.dev/schema.json',
    version: '1.0',

    ai: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.1,
    },

    review: {
      enabled: true,
      incremental: false,
      autoFix: false,
      rules: {
        complexity: 'error',
        documentation: 'warn',
        naming: 'error',
        security: 'error',
        performance: 'error',
      },
    },

    security: {
      enabled: true,
      minSeverity: 'info',
      checks: 'all',
      includeLowConfidence: true,
      sarif: true,
    },

    performance: {
      enabled: true,
      minImpact: 'low',
      focus: 'both',
      threshold: 85,
    },

    include: ['src/**/*'],

    ignore: ['node_modules/**', 'dist/**'],

    output: {
      format: 'console',
      colors: true,
      verbose: true,
    },

    github: {
      autoReview: true,
      postComments: true,
      statusCheck: true,
      failOnIssues: true,
    },
  },

  minimal: {
    $schema: 'https://code-sherlock.dev/schema.json',
    version: '1.0',

    ai: {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
    },

    review: {
      enabled: true,
      incremental: true,
    },

    security: {
      enabled: true,
      minSeverity: 'error',
    },

    performance: {
      enabled: false,
    },

    ignore: ['node_modules/**', 'dist/**'],
  },
};

export function initCommand(options: InitOptions): void {
  const configPath = resolve('.sherlockrc.json');

  // Check if config already exists
  if (existsSync(configPath) && !options.force) {
    console.log(chalk.yellow('⚠️  Configuration file already exists.'));
    console.log(chalk.gray('   Use --force to overwrite.'));
    return;
  }

  // Get template
  const templateName = options.template as keyof typeof TEMPLATES;
  const template = TEMPLATES[templateName] || TEMPLATES.default;

  // Write config file
  writeFileSync(configPath, JSON.stringify(template, null, 2));

  console.log(chalk.green('✅ Configuration file created: .sherlockrc.json\n'));

  // Print helpful info
  console.log(chalk.bold('📋 Configuration Overview:\n'));

  console.log(chalk.cyan('AI Provider:'));
  console.log(`   Model: ${template.ai.model}`);
  console.log(`   Provider: ${template.ai.provider}\n`);

  console.log(chalk.cyan('Features:'));
  console.log(`   📝 Code Review: ${template.review.enabled ? '✅' : '❌'}`);
  console.log(`   🔒 Security Scan: ${template.security.enabled ? '✅' : '❌'}`);
  console.log(`   ⚡ Performance: ${template.performance.enabled ? '✅' : '❌'}\n`);

  console.log(chalk.bold('🚀 Quick Start:\n'));
  console.log(chalk.gray('   # Review code'));
  console.log('   sherlock review\n');
  console.log(chalk.gray('   # Security scan'));
  console.log('   sherlock security\n');
  console.log(chalk.gray('   # Performance analysis'));
  console.log('   sherlock perf\n');

  console.log(chalk.bold('📚 Environment Variables:\n'));
  console.log(chalk.gray('   # For OpenAI'));
  console.log('   export OPENAI_API_KEY=sk-...\n');
  console.log(chalk.gray('   # For Claude'));
  console.log('   export ANTHROPIC_API_KEY=sk-ant-...\n');

  // Warn about missing API keys
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.yellow('⚠️  No API key detected. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.'));
  }
}
