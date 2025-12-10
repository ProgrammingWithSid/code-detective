/**
 * Security Command - Vulnerability scanning
 */

import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import ora from 'ora';
import { resolve } from 'path';
import {
  createSecurityAnalyzer,
  SecurityAnalysisResult,
  SecurityIssue,
  SecurityIssueType,
} from '../../analyzers';
import { getFiles } from '../utils';

interface SecurityOptions {
  path: string;
  output: string;
  files?: string[];
  ignore?: string[];
  minSeverity: string;
  checks?: string[];
  sarif?: string;
  strict?: boolean;
}

export async function securityCommand(options: SecurityOptions): Promise<void> {
  const spinner = ora('Initializing security scan...').start();

  try {
    spinner.text = 'Scanning for vulnerabilities...';

    // Get files to scan
    const files = await getFiles(options.path, {
      specific: options.files,
      ignore: options.ignore || [],
    });

    if (files.length === 0) {
      spinner.warn('No files found to scan');
      return;
    }

    spinner.info(`Scanning ${files.length} files for security issues...`);

    // Create analyzer with options
    const analyzer = createSecurityAnalyzer({
      minSeverity: options.minSeverity as 'info' | 'warning' | 'error',
      ...(options.checks && { enabledChecks: options.checks as SecurityIssueType[] }),
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

    // Generate SARIF if requested
    if (options.sarif) {
      const sarif = generateSARIF(result);
      writeFileSync(options.sarif, JSON.stringify(sarif, null, 2));
      console.log(chalk.gray(`\nSARIF report written to ${options.sarif}`));
    }

    // Exit with error if strict mode and issues found
    if (options.strict && result.issues.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail(`Security scan failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function printConsoleResults(result: SecurityAnalysisResult): void {
  console.log('\n' + chalk.bold.red('🔒 Security Scan Results\n'));

  if (result.issues.length === 0) {
    console.log(chalk.green('✅ No security vulnerabilities detected!'));
    return;
  }

  // Group by severity
  const critical = result.issues.filter((i) => i.severity === 'error' && i.confidence === 'high');
  const high = result.issues.filter((i) => i.severity === 'error' && i.confidence !== 'high');
  const medium = result.issues.filter((i) => i.severity === 'warning');
  const low = result.issues.filter((i) => i.severity === 'info');

  if (critical.length > 0) {
    console.log(chalk.bold.red('🔴 CRITICAL VULNERABILITIES'));
    printIssueGroup(critical);
  }

  if (high.length > 0) {
    console.log(chalk.bold.red('🟠 HIGH SEVERITY'));
    printIssueGroup(high);
  }

  if (medium.length > 0) {
    console.log(chalk.bold.yellow('🟡 MEDIUM SEVERITY'));
    printIssueGroup(medium);
  }

  if (low.length > 0) {
    console.log(chalk.bold.gray('🟢 LOW SEVERITY'));
    printIssueGroup(low);
  }

  // Summary
  console.log(chalk.bold('\n📊 Summary:'));
  console.log(
    `  ${chalk.red(`Critical: ${critical.length}`)} | ${chalk.red(`High: ${high.length}`)} | ${chalk.yellow(`Medium: ${medium.length}`)} | ${chalk.gray(`Low: ${low.length}`)}`
  );
  console.log(`  Files scanned: ${result.filesAnalyzed}`);
  console.log(`  Time: ${result.analysisTime}ms`);
}

function printIssueGroup(issues: SecurityIssue[]): void {
  for (const issue of issues) {
    console.log(`\n  ${chalk.bold(issue.type.toUpperCase())}`);
    console.log(`  📁 ${issue.file}:${issue.line}`);
    console.log(`  💬 ${issue.message}`);
    if (issue.cweId) {
      console.log(`  🔗 ${chalk.cyan(issue.cweId)} | ${issue.owaspCategory}`);
    }
    if (issue.snippet) {
      console.log(chalk.gray(`  > ${issue.snippet.substring(0, 80)}...`));
    }
    if (issue.suggestion) {
      console.log(chalk.green(`  💡 Fix: ${issue.suggestion}`));
    }
  }
  console.log('');
}

function generateSARIF(result: SecurityAnalysisResult): object {
  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'code-sherlock',
            informationUri: 'https://github.com/your-repo/code-sherlock',
            version: '1.0.0',
            rules: getUniqueRules(result.issues),
          },
        },
        results: result.issues.map((issue) => ({
          ruleId: issue.type,
          level:
            issue.severity === 'error'
              ? 'error'
              : issue.severity === 'warning'
                ? 'warning'
                : 'note',
          message: {
            text: issue.message,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: issue.file,
                },
                region: {
                  startLine: issue.line,
                },
              },
            },
          ],
        })),
      },
    ],
  };
}

function getUniqueRules(issues: SecurityIssue[]): object[] {
  const rules = new Map<string, object>();

  for (const issue of issues) {
    if (!rules.has(issue.type)) {
      rules.set(issue.type, {
        id: issue.type,
        name: issue.type,
        shortDescription: {
          text: issue.message,
        },
        fullDescription: {
          text: issue.description,
        },
        helpUri: issue.references?.[0],
        properties: {
          security_severity:
            issue.severity === 'error' ? '9.0' : issue.severity === 'warning' ? '6.0' : '3.0',
        },
      });
    }
  }

  return Array.from(rules.values());
}
