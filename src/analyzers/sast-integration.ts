/**
 * SAST Integration - Runs Static Application Security Testing tools
 *
 * Supports:
 * - Semgrep (Multi-language security scanning)
 * - SonarQube (Code quality and security)
 * - Bandit (Python security)
 * - Gosec (Go security)
 * - Brakeman (Ruby on Rails security)
 * - npm audit (Node.js dependency vulnerabilities)
 * - Snyk (Multi-language security scanning)
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

export type SASTTool =
  | 'semgrep'
  | 'sonarqube'
  | 'bandit'
  | 'gosec'
  | 'brakeman'
  | 'npm-audit'
  | 'snyk'
  | 'trivy'
  | 'owasp-dependency-check'
  | 'safety'
  | 'pip-audit'
  | 'bundler-audit'
  | 'cargo-audit'
  | 'mix-audit'
  | 'custom';

export interface SASTIssue {
  file: string;
  line: number;
  column?: number;
  message: string;
  rule?: string;
  severity: Severity;
  confidence: 'high' | 'medium' | 'low';
  cweId?: string;
  owaspCategory?: string;
  fix?: string;
  tool: SASTTool;
  /** Security issue type */
  type?: string;
  /** References/links */
  references?: string[];
}

export interface SASTResult {
  issues: SASTIssue[];
  filesAnalyzed: number;
  analysisTime: number;
  toolsUsed: SASTTool[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byType: Record<string, number>;
}

export interface SASTConfig {
  enabled: boolean;
  tools: SASTTool[];
  /** Custom command mappings */
  customCommands?: Record<string, string>;
  /** Files/patterns to ignore */
  ignorePatterns?: string[];
  /** Working directory */
  workingDir?: string;
  /** Minimum severity to report */
  minSeverity?: Severity;
  /** Semgrep specific config */
  semgrep?: {
    config?: string;
    rules?: string[];
    severity?: string[];
  };
  /** SonarQube specific config */
  sonarqube?: {
    projectKey?: string;
    serverUrl?: string;
    token?: string;
  };
  /** Bandit specific config */
  bandit?: {
    configFile?: string;
    severityLevel?: number;
  };
  /** Gosec specific config */
  gosec?: {
    severity?: string;
    confidence?: string;
  };
  /** npm audit specific config */
  npmAudit?: {
    auditLevel?: 'low' | 'moderate' | 'high' | 'critical';
  };
  /** Snyk specific config */
  snyk?: {
    org?: string;
    severityThreshold?: string;
  };
}

// ============================================================================
// SAST Integration Class
// ============================================================================

export class SASTIntegration {
  private config: SASTConfig;
  private workingDir: string;

  constructor(config: SASTConfig = { enabled: true, tools: [] }) {
    this.config = {
      ...config,
      enabled: config.enabled ?? true,
      tools: config.tools ?? [],
      minSeverity: config.minSeverity ?? 'info',
    };
    this.workingDir = config.workingDir || process.cwd();
  }

  /**
   * Run SAST tools on changed files
   */
  async analyze(files: Array<{ path: string; content: string }>): Promise<SASTResult> {
    if (!this.config.enabled || this.config.tools.length === 0) {
      return {
        issues: [],
        filesAnalyzed: 0,
        analysisTime: 0,
        toolsUsed: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0 },
        byType: {},
      };
    }

    const startTime = Date.now();
    const allIssues: SASTIssue[] = [];
    const toolsUsed: SASTTool[] = [];

    // Filter files that should be analyzed
    const filesToAnalyze = files.filter((f) => !this.shouldIgnore(f.path));

    if (filesToAnalyze.length === 0) {
      return {
        issues: [],
        filesAnalyzed: 0,
        analysisTime: Date.now() - startTime,
        toolsUsed: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0 },
        byType: {},
      };
    }

    // Run each enabled SAST tool
    for (const tool of this.config.tools) {
      try {
        const issues = await this.runSASTTool(tool, filesToAnalyze);
        if (issues.length > 0) {
          allIssues.push(...issues);
          toolsUsed.push(tool);
        }
      } catch (error) {
        console.warn(`Failed to run ${tool}:`, error instanceof Error ? error.message : error);
      }
    }

    // Filter by minimum severity
    const filteredIssues = this.filterBySeverity(allIssues);

    // Calculate summary
    const summary = {
      critical: filteredIssues.filter((i) => i.severity === 'error' && i.confidence === 'high')
        .length,
      high: filteredIssues.filter((i) => i.severity === 'error').length,
      medium: filteredIssues.filter((i) => i.severity === 'warning').length,
      low: filteredIssues.filter((i) => i.severity === 'info' || i.severity === 'suggestion')
        .length,
    };

    // Group by type
    const byType: Record<string, number> = {};
    for (const issue of filteredIssues) {
      const type = issue.type || 'other';
      byType[type] = (byType[type] || 0) + 1;
    }

    const analysisTime = Date.now() - startTime;

    return {
      issues: filteredIssues,
      filesAnalyzed: filesToAnalyze.length,
      analysisTime,
      toolsUsed,
      summary,
      byType,
    };
  }

  /**
   * Convert SAST issues to review comments
   */
  convertToReviewComments(result: SASTResult): ReviewComment[] {
    return result.issues.map((issue) => ({
      file: issue.file,
      line: issue.line,
      body: `[${issue.tool}] ${issue.message}${issue.cweId ? ` (CWE-${issue.cweId})` : ''}${
        issue.rule ? ` - Rule: ${issue.rule}` : ''
      }`,
      severity: issue.severity,
      rule: issue.rule,
      category: `security-${issue.type || 'other'}`,
      fix: issue.fix,
      tool: issue.tool,
    }));
  }

  // ============================================================================
  // Private Methods - SAST Tool Execution
  // ============================================================================

  private async runSASTTool(
    tool: SASTTool,
    files: Array<{ path: string; content: string }>
  ): Promise<SASTIssue[]> {
    switch (tool) {
      case 'semgrep':
        return this.runSemgrep(files);
      case 'sonarqube':
        return this.runSonarQube(files);
      case 'bandit':
        return this.runBandit(files);
      case 'gosec':
        return this.runGosec(files);
      case 'brakeman':
        return this.runBrakeman(files);
      case 'npm-audit':
        return this.runNpmAudit();
      case 'snyk':
        return this.runSnyk();
      case 'custom':
        return this.runCustomSAST(files);
      default:
        return [];
    }
  }

  private async runSemgrep(files: Array<{ path: string; content: string }>): Promise<SASTIssue[]> {
    try {
      const filePaths = files.map((f) => f.path).join(' ');
      const configFlag = this.config.semgrep?.config
        ? `--config ${this.config.semgrep.config}`
        : '--config auto';
      const severityFilter = this.config.semgrep?.severity
        ? `--severity ${this.config.semgrep.severity.join(',')}`
        : '';

      const command = `semgrep ${configFlag} ${severityFilter} --json ${filePaths}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 50 * 1024 * 1024, // 50MB for Semgrep
      });

      const results = JSON.parse(stdout || '{}') as {
        results?: Array<{
          path?: string;
          start?: { line?: number; col?: number };
          line?: number;
          message?: string;
          check_id?: string;
          extra?: {
            severity?: string;
            fix?: string;
            metadata?: {
              confidence?: string;
              cwe?: string[];
              owasp?: string;
              category?: string;
              references?: string[];
            };
          };
        }>;
      };
      const issues: SASTIssue[] = [];

      for (const result of results.results || []) {
        issues.push({
          file: result.path || '',
          line: result.start?.line || result.line || 1,
          column: result.start?.col,
          message: result.message || '',
          rule: result.check_id,
          severity: this.mapSemgrepSeverity(result.extra?.severity || ''),
          confidence: this.mapSemgrepConfidence(result.extra?.metadata?.confidence || ''),
          cweId: result.extra?.metadata?.cwe?.[0]?.replace('CWE-', ''),
          owaspCategory: result.extra?.metadata?.owasp,
          type: result.extra?.metadata?.category || 'security',
          tool: 'semgrep',
          fix: result.extra?.fix,
          references: result.extra?.metadata?.references,
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

  private runSonarQube(_files: Array<{ path: string; content: string }>): Promise<SASTIssue[]> {
    // SonarQube typically requires a full project scan
    // This is a simplified integration - full implementation would require
    // SonarQube server setup and sonar-scanner CLI
    console.warn('SonarQube integration requires SonarQube server setup. Skipping for now.');
    return Promise.resolve([]);
  }

  private async runBandit(files: Array<{ path: string; content: string }>): Promise<SASTIssue[]> {
    const pyFiles = files.filter((f) => f.path.endsWith('.py'));

    if (pyFiles.length === 0) return [];

    try {
      const filePaths = pyFiles.map((f) => f.path).join(' ');
      const configFlag = this.config.bandit?.configFile
        ? `-c ${this.config.bandit.configFile}`
        : '';
      const severityFlag = this.config.bandit?.severityLevel
        ? `-l ${this.config.bandit.severityLevel}`
        : '';

      const command = `bandit ${configFlag} ${severityFlag} -f json ${filePaths}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const results = JSON.parse(stdout || '{}') as {
        results?: Array<{
          filename?: string;
          line_number?: number;
          col_offset?: number;
          issue_text?: string;
          test_id?: string;
          issue_severity?: string;
          issue_confidence?: string;
          issue_cwe?: { id?: number };
          more_info?: string;
        }>;
      };
      const issues: SASTIssue[] = [];

      for (const result of results.results || []) {
        issues.push({
          file: result.filename || '',
          line: result.line_number || 1,
          column: result.col_offset,
          message: result.issue_text || '',
          rule: result.test_id,
          severity: this.mapBanditSeverity(result.issue_severity || ''),
          confidence: this.mapBanditConfidence(result.issue_confidence || ''),
          cweId: result.issue_cwe?.id?.toString(),
          type: 'security',
          tool: 'bandit',
          references: result.more_info ? [result.more_info] : undefined,
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

  private async runGosec(files: Array<{ path: string; content: string }>): Promise<SASTIssue[]> {
    const goFiles = files.filter((f) => f.path.endsWith('.go'));

    if (goFiles.length === 0) return [];

    try {
      const filePaths = goFiles.map((f) => f.path).join(' ');
      const severityFlag = this.config.gosec?.severity || 'medium';
      const confidenceFlag = this.config.gosec?.confidence || 'medium';

      const command = `gosec -fmt json -severity ${severityFlag} -confidence ${confidenceFlag} ${filePaths}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const results = JSON.parse(stdout || '{}') as {
        Gosec?: {
          Issues?: Array<{
            file?: string;
            line?: number;
            column?: number;
            details?: string;
            rule_id?: string;
            severity?: string;
            confidence?: string;
            cwe?: { ID?: string };
          }>;
        };
      };
      const issues: SASTIssue[] = [];

      for (const result of results.Gosec?.Issues || []) {
        issues.push({
          file: result.file || '',
          line: result.line || 1,
          column: result.column,
          message: result.details || '',
          rule: result.rule_id,
          severity: this.mapGosecSeverity(result.severity || ''),
          confidence: this.mapGosecConfidence(result.confidence || ''),
          cweId: result.cwe?.ID,
          type: 'security',
          tool: 'gosec',
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

  private async runBrakeman(files: Array<{ path: string; content: string }>): Promise<SASTIssue[]> {
    // Brakeman scans Rails applications
    const rbFiles = files.filter((f) => f.path.endsWith('.rb'));

    if (rbFiles.length === 0) return [];

    try {
      const command = `brakeman --format json --no-pager`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const typedResults = JSON.parse(stdout || '{}') as {
        warnings?: Array<{
          file?: string;
          line?: number;
          column?: number;
          message?: string;
          warning_type?: string;
          confidence?: number;
          cwe_id?: number;
          fix_available?: boolean;
        }>;
      };
      const issues: SASTIssue[] = [];
      for (const warning of typedResults.warnings || []) {
        issues.push({
          file: warning.file || '',
          line: warning.line || 1,
          column: warning.column,
          message: warning.message || '',
          rule: warning.warning_type,
          severity: this.mapBrakemanSeverity(warning.confidence || 0),
          confidence: this.mapBrakemanConfidence(warning.confidence || 0),
          cweId: warning.cwe_id?.toString(),
          type: 'security',
          tool: 'brakeman',
          fix: warning.fix_available ? 'Fix available - see Brakeman documentation' : undefined,
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

  private async runNpmAudit(): Promise<SASTIssue[]> {
    // Check if package.json exists
    if (!existsSync(join(this.workingDir, 'package.json'))) {
      return [];
    }

    try {
      const auditLevel = this.config.npmAudit?.auditLevel || 'moderate';
      const command = `npm audit --audit-level=${auditLevel} --json`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      const typedResults = JSON.parse(stdout || '{}') as {
        advisories?: Record<
          string,
          Array<{
            title?: string;
            id?: number;
            severity?: string;
            cwe?: string;
            fixAvailable?: boolean;
            references?: string;
          }>
        >;
      };
      const issues: SASTIssue[] = [];
      for (const [packageName, advisories] of Object.entries(typedResults.advisories || {})) {
        const advisory = advisories[0];
        if (advisory) {
          issues.push({
            file: 'package.json',
            line: 1,
            message: `Vulnerable dependency: ${packageName} - ${advisory.title || ''}`,
            rule: advisory.id?.toString(),
            severity: this.mapNpmAuditSeverity(advisory.severity || ''),
            confidence: 'high',
            cweId: advisory.cwe,
            type: 'dependency-vulnerability',
            tool: 'npm-audit',
            fix: `Run: npm audit fix${advisory.fixAvailable ? ' (fix available)' : ''}`,
            references: advisory.references ? [advisory.references] : undefined,
          });
        }
      }

      return issues;
    } catch (error: unknown) {
      // npm audit returns non-zero exit code when vulnerabilities are found
      if (error instanceof Error && error.message.includes('Command failed')) {
        // Try to parse the error output
        try {
          const { stdout } = await execAsync('npm audit --json', {
            cwd: this.workingDir,
            maxBuffer: 10 * 1024 * 1024,
          });
          return this.parseNpmAuditOutput(stdout);
        } catch {
          return [];
        }
      }
      throw error;
    }
  }

  private parseNpmAuditOutput(output: string): SASTIssue[] {
    const issues: SASTIssue[] = [];
    const results = JSON.parse(output || '{}') as {
      advisories?: Record<
        string,
        Array<{
          title?: string;
          id?: number;
          severity?: string;
          cwe?: string;
          fixAvailable?: boolean;
          references?: string;
        }>
      >;
    };

    for (const [packageName, advisories] of Object.entries(results.advisories || {})) {
      const advisory = advisories[0];
      if (advisory) {
        issues.push({
          file: 'package.json',
          line: 1,
          message: `Vulnerable dependency: ${packageName} - ${advisory.title || ''}`,
          rule: advisory.id?.toString(),
          severity: this.mapNpmAuditSeverity(advisory.severity || ''),
          confidence: 'high',
          cweId: advisory.cwe,
          type: 'dependency-vulnerability',
          tool: 'npm-audit',
          fix: `Run: npm audit fix${advisory.fixAvailable ? ' (fix available)' : ''}`,
          references: advisory.references ? [advisory.references] : undefined,
        });
      }
    }

    return issues;
  }

  private runSnyk(): Promise<SASTIssue[]> {
    // Snyk requires authentication and setup
    // This is a placeholder - full implementation would require Snyk CLI setup
    console.warn('Snyk integration requires Snyk CLI setup and authentication. Skipping for now.');
    return Promise.resolve([]);
  }

  private async runTrivy(_files: Array<{ path: string; content: string }>): Promise<SASTIssue[]> {
    try {
      const command = `trivy fs --format json --exit-code 0 ${this.workingDir}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 50 * 1024 * 1024,
      });
      const results = JSON.parse(stdout || '{}') as {
        Results?: Array<{
          Target?: string;
          Vulnerabilities?: Array<{
            VulnerabilityID?: string;
            Title?: string;
            Description?: string;
            Severity?: string;
            CweIDs?: string[];
            FixedVersion?: string;
            References?: string[];
          }>;
        }>;
      };
      const issues: SASTIssue[] = [];

      for (const result of results.Results || []) {
        for (const vuln of result.Vulnerabilities || []) {
          issues.push({
            file: result.Target || 'unknown',
            line: 1,
            message: `${vuln.VulnerabilityID || ''}: ${vuln.Title || vuln.Description || ''}`,
            rule: vuln.VulnerabilityID,
            severity: this.mapTrivySeverity(vuln.Severity || ''),
            confidence: 'high',
            cweId: vuln.CweIDs?.[0],
            type: 'dependency-vulnerability',
            tool: 'trivy',
            fix: vuln.FixedVersion ? `Update to ${vuln.FixedVersion}` : undefined,
            references: vuln.References,
          });
        }
      }

      return issues;
    } catch {
      return [];
    }
  }

  private async runOWASPDependencyCheck(): Promise<SASTIssue[]> {
    try {
      const command = `dependency-check --format JSON --out . --scan ${this.workingDir}`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 50 * 1024 * 1024,
      });
      const results = JSON.parse(stdout || '{}') as {
        dependencies?: Array<{
          filePath?: string;
          vulnerabilities?: Array<{
            name?: string;
            description?: string;
            severity?: string;
            cwe?: string;
            references?: Array<{ url?: string }>;
          }>;
        }>;
      };
      const issues: SASTIssue[] = [];

      for (const dep of results.dependencies || []) {
        for (const vuln of dep.vulnerabilities || []) {
          issues.push({
            file: dep.filePath || 'unknown',
            line: 1,
            message: `${vuln.name || ''}: ${vuln.description || ''}`,
            rule: vuln.name,
            severity: this.mapOWASPSeverity(vuln.severity || ''),
            confidence: 'high',
            cweId: vuln.cwe,
            type: 'dependency-vulnerability',
            tool: 'owasp-dependency-check',
            references: vuln.references
              ?.map((r) => r.url)
              .filter((url): url is string => Boolean(url)),
          });
        }
      }

      return issues;
    } catch {
      return [];
    }
  }

  private async runSafety(): Promise<SASTIssue[]> {
    if (!existsSync(join(this.workingDir, 'requirements.txt'))) {
      return [];
    }

    try {
      const command = `safety check --json`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const results = JSON.parse(stdout || '[]') as Array<{
        package?: string;
        vulnerability?: string;
        vulnerability_id?: string;
        spec?: string;
      }>;
      const issues: SASTIssue[] = [];

      for (const result of results) {
        issues.push({
          file: 'requirements.txt',
          line: 1,
          message: `${result.package || ''}: ${result.vulnerability || ''}`,
          rule: result.vulnerability_id,
          severity: 'error',
          confidence: 'high',
          type: 'dependency-vulnerability',
          tool: 'safety',
          fix: result.spec ? `Update to ${result.spec}` : undefined,
        });
      }

      return issues;
    } catch {
      return [];
    }
  }

  private async runPipAudit(): Promise<SASTIssue[]> {
    if (!existsSync(join(this.workingDir, 'requirements.txt'))) {
      return [];
    }

    try {
      const command = `pip-audit --format json`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const results = JSON.parse(stdout || '{}') as {
        vulnerabilities?: Array<{
          name?: string;
          id?: string;
          severity?: string;
          aliases?: string[];
          fix_versions?: string[];
        }>;
      };
      const issues: SASTIssue[] = [];

      for (const vuln of results.vulnerabilities || []) {
        issues.push({
          file: 'requirements.txt',
          line: 1,
          message: `${vuln.name || ''}: ${vuln.id || ''}`,
          rule: vuln.id,
          severity: this.mapPipAuditSeverity(vuln.severity || ''),
          confidence: 'high',
          cweId: vuln.aliases?.[0],
          type: 'dependency-vulnerability',
          tool: 'pip-audit',
          fix: vuln.fix_versions?.[0] ? `Update to ${vuln.fix_versions[0]}` : undefined,
        });
      }

      return issues;
    } catch {
      return [];
    }
  }

  private async runBundlerAudit(): Promise<SASTIssue[]> {
    if (!existsSync(join(this.workingDir, 'Gemfile.lock'))) {
      return [];
    }

    try {
      const command = `bundler-audit check --format json`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const results = JSON.parse(stdout || '[]') as Array<{
        gem?: string;
        advisory?: {
          title?: string;
          cve?: string;
          criticality?: string;
          cwe?: string;
          patched_versions?: string[];
        };
      }>;
      const issues: SASTIssue[] = [];

      for (const result of results) {
        if (result.advisory) {
          issues.push({
            file: 'Gemfile.lock',
            line: 1,
            message: `${result.gem || ''}: ${result.advisory.title || ''}`,
            rule: result.advisory.cve,
            severity: this.mapBundlerAuditSeverity(result.advisory.criticality || ''),
            confidence: 'high',
            cweId: result.advisory.cwe,
            type: 'dependency-vulnerability',
            tool: 'bundler-audit',
            fix: result.advisory.patched_versions
              ? `Update to ${result.advisory.patched_versions[0]}`
              : undefined,
          });
        }
      }

      return issues;
    } catch {
      return [];
    }
  }

  private async runCargoAudit(): Promise<SASTIssue[]> {
    if (!existsSync(join(this.workingDir, 'Cargo.toml'))) {
      return [];
    }

    try {
      const command = `cargo audit --json`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const results = JSON.parse(stdout || '{}') as {
        vulnerabilities?: {
          list?: Array<{
            package?: string;
            advisory?: {
              title?: string;
              id?: string;
              cvss?: number;
            };
            versions?: string;
          }>;
        };
      };
      const issues: SASTIssue[] = [];

      for (const vuln of results.vulnerabilities?.list || []) {
        if (vuln.advisory) {
          issues.push({
            file: 'Cargo.toml',
            line: 1,
            message: `${vuln.package || ''}: ${vuln.advisory.title || ''}`,
            rule: vuln.advisory.id,
            severity: this.mapCargoAuditSeverity(vuln.advisory.cvss || 0),
            confidence: 'high',
            type: 'dependency-vulnerability',
            tool: 'cargo-audit',
            fix: vuln.versions ? `Update to ${vuln.versions}` : undefined,
          });
        }
      }

      return issues;
    } catch {
      return [];
    }
  }

  private async runMixAudit(): Promise<SASTIssue[]> {
    if (!existsSync(join(this.workingDir, 'mix.lock'))) {
      return [];
    }

    try {
      const command = `mix audit --format json`;
      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      const results = JSON.parse(stdout || '[]') as Array<{
        package?: string;
        advisory?: {
          title?: string;
          cve?: string;
          cvss?: number;
        };
      }>;
      const issues: SASTIssue[] = [];

      for (const result of results) {
        if (result.advisory) {
          issues.push({
            file: 'mix.lock',
            line: 1,
            message: `${result.package || ''}: ${result.advisory.title || ''}`,
            rule: result.advisory.cve,
            severity: this.mapMixAuditSeverity(result.advisory.cvss || 0),
            confidence: 'high',
            type: 'dependency-vulnerability',
            tool: 'mix-audit',
          });
        }
      }

      return issues;
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Severity Mapping Helpers
  // ============================================================================

  private mapTrivySeverity(severity: string): Severity {
    if (severity === 'CRITICAL' || severity === 'HIGH') return 'error';
    if (severity === 'MEDIUM') return 'warning';
    return 'info';
  }

  private mapOWASPSeverity(severity: string): Severity {
    if (severity === 'Critical' || severity === 'High') return 'error';
    if (severity === 'Medium') return 'warning';
    return 'info';
  }

  private mapPipAuditSeverity(severity: string): Severity {
    if (severity === 'CRITICAL' || severity === 'HIGH') return 'error';
    if (severity === 'MEDIUM') return 'warning';
    return 'info';
  }

  private mapBundlerAuditSeverity(criticality: string): Severity {
    if (criticality === 'Critical' || criticality === 'High') return 'error';
    if (criticality === 'Medium') return 'warning';
    return 'info';
  }

  private mapCargoAuditSeverity(cvss: number): Severity {
    if (cvss >= 7.0) return 'error';
    if (cvss >= 4.0) return 'warning';
    return 'info';
  }

  private mapMixAuditSeverity(cvss: number): Severity {
    if (cvss >= 7.0) return 'error';
    if (cvss >= 4.0) return 'warning';
    return 'info';
  }

  private async runCustomSAST(
    files: Array<{ path: string; content: string }>
  ): Promise<SASTIssue[]> {
    if (!this.config.customCommands) return [];

    const issues: SASTIssue[] = [];

    for (const [toolName, command] of Object.entries(this.config.customCommands)) {
      try {
        const filePaths = files.map((f) => f.path).join(' ');
        const fullCommand = command.replace('{files}', filePaths);

        await execAsync(fullCommand, {
          cwd: this.workingDir,
          maxBuffer: 10 * 1024 * 1024,
        });

        // Custom parsers would need to be implemented per tool
        console.warn(`Custom SAST tool ${toolName} output not parsed`);
      } catch (error) {
        console.warn(`Custom SAST tool ${toolName} failed:`, error);
      }
    }

    return issues;
  }

  // ============================================================================
  // Private Methods - Severity Mapping
  // ============================================================================

  private mapSemgrepSeverity(severity: string): Severity {
    if (severity === 'ERROR' || severity === 'CRITICAL') return 'error';
    if (severity === 'WARNING' || severity === 'HIGH') return 'warning';
    return 'info';
  }

  private mapSemgrepConfidence(confidence: string): 'high' | 'medium' | 'low' {
    if (confidence === 'HIGH') return 'high';
    if (confidence === 'MEDIUM') return 'medium';
    return 'low';
  }

  private mapBanditSeverity(severity: string): Severity {
    if (severity === 'HIGH') return 'error';
    if (severity === 'MEDIUM') return 'warning';
    return 'info';
  }

  private mapBanditConfidence(confidence: string): 'high' | 'medium' | 'low' {
    if (confidence === 'HIGH') return 'high';
    if (confidence === 'MEDIUM') return 'medium';
    return 'low';
  }

  private mapGosecSeverity(severity: string): Severity {
    if (severity === 'HIGH' || severity === 'CRITICAL') return 'error';
    if (severity === 'MEDIUM') return 'warning';
    return 'info';
  }

  private mapGosecConfidence(confidence: string): 'high' | 'medium' | 'low' {
    if (confidence === 'HIGH') return 'high';
    if (confidence === 'MEDIUM') return 'medium';
    return 'low';
  }

  private mapBrakemanSeverity(confidence: number): Severity {
    // Brakeman uses confidence (0-3), higher = more confident = more severe
    if (confidence >= 2) return 'error';
    if (confidence >= 1) return 'warning';
    return 'info';
  }

  private mapBrakemanConfidence(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 2) return 'high';
    if (confidence >= 1) return 'medium';
    return 'low';
  }

  private mapNpmAuditSeverity(severity: string): Severity {
    if (severity === 'critical' || severity === 'high') return 'error';
    if (severity === 'moderate') return 'warning';
    return 'info';
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private filterBySeverity(issues: SASTIssue[]): SASTIssue[] {
    if (!this.config.minSeverity) return issues;

    const severityOrder: Severity[] = ['info', 'suggestion', 'warning', 'error'];
    const minIndex = severityOrder.indexOf(this.config.minSeverity);

    return issues.filter((issue) => severityOrder.indexOf(issue.severity) >= minIndex);
  }

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

export function createSASTIntegration(config?: SASTConfig): SASTIntegration {
  return new SASTIntegration(config);
}
