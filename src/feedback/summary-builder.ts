/**
 * Summary Builder - Generates PR summaries and walkthroughs
 */

import { AIProviderInterface } from '../ai-provider';
import { ChangedFile, CodeChunk, Config } from '../types';
import {
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  ChangeCategory,
  DEFAULT_SUMMARY_OPTIONS,
  FileChange,
  FileGroup,
  PRStats,
  PRSummary,
  PRWalkthrough,
  RiskAssessment,
  RiskFactor,
  RISK_FACTORS,
  SummaryOptions,
  SummaryRecommendation,
  WalkthroughSection,
} from '../types/summary';
import { DiagramGenerator } from './diagram-generator';

// ============================================================================
// File Category Patterns
// ============================================================================

const CATEGORY_PATTERNS: Record<ChangeCategory, RegExp[]> = {
  test: [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//, /\.cy\.[jt]s$/],
  docs: [/\.md$/, /\.mdx$/, /docs\//, /README/i, /CHANGELOG/i],
  config: [
    /\.config\.[jt]s$/,
    /\.json$/,
    /\.ya?ml$/,
    /\.env/,
    /tsconfig/,
    /eslint/,
    /prettier/,
    /webpack/,
    /vite/,
  ],
  style: [/\.css$/, /\.scss$/, /\.less$/, /\.styled\.[jt]sx?$/],
  dependency: [/package\.json$/, /pnpm-lock/, /yarn\.lock/, /package-lock/],
  feature: [],
  bugfix: [],
  refactor: [],
  other: [],
};

const SECURITY_PATTERNS = [
  /auth/,
  /password/,
  /secret/,
  /token/,
  /credential/,
  /security/,
  /\.env/,
];

const DATABASE_PATTERNS = [/migration/, /schema/, /\.sql$/, /prisma/, /database/, /model/];

const API_PATTERNS = [/api\//, /routes\//, /controller/, /handler/, /endpoint/];

// ============================================================================
// Summary Builder Class
// ============================================================================

export class SummaryBuilder {
  private diagramGenerator: DiagramGenerator;
  private aiProvider?: AIProviderInterface;

  constructor(_config: Config, aiProvider?: AIProviderInterface) {
    // Config reserved for future use (e.g., custom category patterns)
    this.aiProvider = aiProvider;
    this.diagramGenerator = new DiagramGenerator();
  }

  /**
   * Build a complete PR summary
   */
  async buildSummary(
    changedFiles: ChangedFile[],
    chunks: CodeChunk[],
    options: SummaryOptions = DEFAULT_SUMMARY_OPTIONS
  ): Promise<PRSummary> {
    const fileChanges = this.convertToFileChanges(changedFiles);
    const stats = this.calculateStats(fileChanges);
    const changeGroups = this.groupFilesByCategory(fileChanges);
    const risk = this.assessRisk(fileChanges, stats);

    let insights: string[] = [];
    if (options.includeInsights && this.aiProvider) {
      insights = await this.generateInsights(changedFiles, chunks);
    }

    const title = this.generateTitle(changeGroups, stats);
    const overview = this.generateOverview(changeGroups, stats, risk);
    const recommendation = this.determineRecommendation(risk, stats);

    return {
      title,
      overview,
      changeGroups,
      stats,
      risk,
      insights,
      recommendation,
    };
  }

  /**
   * Build a detailed PR walkthrough with diagrams
   */
  async buildWalkthrough(
    changedFiles: ChangedFile[],
    chunks: CodeChunk[],
    options: SummaryOptions = DEFAULT_SUMMARY_OPTIONS
  ): Promise<PRWalkthrough> {
    const summary = await this.buildSummary(changedFiles, chunks, options);
    const fileChanges = this.convertToFileChanges(changedFiles);

    const sections = this.buildWalkthroughSections(summary, options);

    let sequenceDiagram: string | undefined;
    let fileTreeDiagram: string | undefined;
    let dependencyDiagram: string | undefined;

    if (options.includeDiagrams) {
      fileTreeDiagram = this.diagramGenerator.generateFileTree(fileChanges);

      if (chunks.length > 0) {
        dependencyDiagram = this.diagramGenerator.generateDependency(chunks, {
          direction: 'LR',
          maxNodes: 15,
        });
      }
    }

    return {
      title: summary.title,
      overview: {
        title: 'Overview',
        emoji: '📋',
        content: summary.overview,
      },
      sections,
      sequenceDiagram,
      fileTreeDiagram,
      dependencyDiagram,
    };
  }

  /**
   * Format summary as markdown for PR comment
   */
  formatAsMarkdown(summary: PRSummary, options: SummaryOptions = DEFAULT_SUMMARY_OPTIONS): string {
    const lines: string[] = [];

    // Header
    lines.push(`## 📋 ${summary.title}`);
    lines.push('');
    lines.push(summary.overview);
    lines.push('');

    // Statistics
    lines.push('### 📊 Statistics');
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Files Changed | ${summary.stats.totalFiles} |`);
    lines.push(`| Lines Added | +${summary.stats.totalAdditions} |`);
    lines.push(`| Lines Removed | -${summary.stats.totalDeletions} |`);
    lines.push('');

    // Risk Assessment
    if (options.includeRisk) {
      lines.push(`### ${this.getRiskEmoji(summary.risk.level)} Risk Assessment`);
      lines.push('');
      lines.push(
        `**Level:** ${summary.risk.level.toUpperCase()} (Score: ${summary.risk.score}/100)`
      );
      lines.push('');

      if (summary.risk.factors.filter((f) => f.detected).length > 0) {
        lines.push('**Risk Factors:**');
        for (const factor of summary.risk.factors.filter((f) => f.detected)) {
          lines.push(`- ⚠️ ${factor.description}`);
        }
        lines.push('');
      }
    }

    // Changes by Category
    lines.push('### 📁 Changes by Category');
    lines.push('');

    for (const group of summary.changeGroups) {
      if (group.files.length === 0) continue;

      const emoji = CATEGORY_EMOJI[group.category];
      const label = CATEGORY_LABELS[group.category];

      if (options.collapsible) {
        lines.push(`<details>`);
        lines.push(`<summary>${emoji} <b>${label}</b> (${group.files.length} files)</summary>`);
        lines.push('');
      } else {
        lines.push(`#### ${emoji} ${label}`);
        lines.push('');
      }

      lines.push(group.summary);
      lines.push('');

      // File list
      const maxFiles = options.maxFilesPerCategory ?? 10;
      const filesToShow = group.files.slice(0, maxFiles);

      for (const file of filesToShow) {
        const statusEmoji = this.getStatusEmoji(file.status);
        lines.push(`- ${statusEmoji} \`${file.path}\` (+${file.additions}/-${file.deletions})`);
      }

      if (group.files.length > maxFiles) {
        lines.push(`- ... and ${group.files.length - maxFiles} more files`);
      }

      if (options.collapsible) {
        lines.push('');
        lines.push('</details>');
      }
      lines.push('');
    }

    // AI Insights
    if (options.includeInsights && summary.insights.length > 0) {
      lines.push('### 💡 AI Insights');
      lines.push('');
      for (const insight of summary.insights) {
        lines.push(`- ${insight}`);
      }
      lines.push('');
    }

    // Recommendation
    lines.push('### 🎯 Recommendation');
    lines.push('');
    lines.push(this.formatRecommendation(summary.recommendation));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format walkthrough as markdown
   */
  formatWalkthroughAsMarkdown(
    walkthrough: PRWalkthrough,
    options: SummaryOptions = DEFAULT_SUMMARY_OPTIONS
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`## 🚀 ${walkthrough.title}`);
    lines.push('');

    // Overview
    lines.push(`### ${walkthrough.overview.emoji} ${walkthrough.overview.title}`);
    lines.push('');
    lines.push(walkthrough.overview.content);
    lines.push('');

    // File Tree Diagram
    if (options.includeDiagrams && walkthrough.fileTreeDiagram) {
      lines.push('<details>');
      lines.push('<summary>📁 <b>File Changes Diagram</b></summary>');
      lines.push('');
      lines.push(walkthrough.fileTreeDiagram);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    // Sections
    for (const section of walkthrough.sections) {
      if (options.collapsible && section.collapsed) {
        lines.push('<details>');
        lines.push(`<summary>${section.emoji} <b>${section.title}</b></summary>`);
        lines.push('');
      } else {
        lines.push(`### ${section.emoji} ${section.title}`);
        lines.push('');
      }

      lines.push(section.content);
      lines.push('');

      if (section.files && section.files.length > 0) {
        lines.push('**Files:**');
        for (const file of section.files.slice(0, 5)) {
          lines.push(`- \`${file}\``);
        }
        if (section.files.length > 5) {
          lines.push(`- ... and ${section.files.length - 5} more`);
        }
        lines.push('');
      }

      if (options.collapsible && section.collapsed) {
        lines.push('</details>');
        lines.push('');
      }
    }

    // Dependency Diagram
    if (options.includeDiagrams && walkthrough.dependencyDiagram) {
      lines.push('<details>');
      lines.push('<summary>🔗 <b>Dependency Graph</b></summary>');
      lines.push('');
      lines.push(walkthrough.dependencyDiagram);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    return lines.join('\n');
  }

  // ============================================================================
  // Private Methods - File Processing
  // ============================================================================

  private convertToFileChanges(changedFiles: ChangedFile[]): FileChange[] {
    return changedFiles.map((file) => ({
      path: file.path,
      status: file.status,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      language: this.detectLanguage(file.path),
    }));
  }

  private detectLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, string> = {
      ts: 'TypeScript',
      tsx: 'TypeScript React',
      js: 'JavaScript',
      jsx: 'JavaScript React',
      vue: 'Vue',
      py: 'Python',
      rb: 'Ruby',
      go: 'Go',
      rs: 'Rust',
      java: 'Java',
      css: 'CSS',
      scss: 'SCSS',
      html: 'HTML',
      json: 'JSON',
      yaml: 'YAML',
      yml: 'YAML',
      md: 'Markdown',
    };
    return langMap[ext] ?? ext.toUpperCase();
  }

  private categorizeFile(file: FileChange): ChangeCategory {
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(file.path)) {
          return category as ChangeCategory;
        }
      }
    }
    return 'other';
  }

  private groupFilesByCategory(files: FileChange[]): FileGroup[] {
    const groups: Map<ChangeCategory, FileChange[]> = new Map();

    for (const file of files) {
      const category = this.categorizeFile(file);
      const existing = groups.get(category) ?? [];
      existing.push(file);
      groups.set(category, existing);
    }

    const result: FileGroup[] = [];
    for (const [category, categoryFiles] of groups) {
      result.push({
        category,
        files: categoryFiles,
        summary: this.generateGroupSummary(category, categoryFiles),
      });
    }

    // Sort by number of files (descending)
    return result.sort((a, b) => b.files.length - a.files.length);
  }

  private generateGroupSummary(_category: ChangeCategory, files: FileChange[]): string {
    // Category reserved for future use (category-specific summaries)
    const additions = files.reduce((sum, f) => sum + f.additions, 0);
    const deletions = files.reduce((sum, f) => sum + f.deletions, 0);
    const languages = [...new Set(files.map((f) => f.language))].slice(0, 3);

    return (
      `${files.length} file(s) changed with +${additions}/-${deletions} lines. ` +
      `Languages: ${languages.join(', ')}.`
    );
  }

  // ============================================================================
  // Private Methods - Statistics & Risk
  // ============================================================================

  private calculateStats(files: FileChange[]): PRStats {
    return {
      totalFiles: files.length,
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      filesAdded: files.filter((f) => f.status === 'added').length,
      filesModified: files.filter((f) => f.status === 'modified').length,
      filesDeleted: files.filter((f) => f.status === 'deleted').length,
    };
  }

  private assessRisk(files: FileChange[], stats: PRStats): RiskAssessment {
    const factors: RiskFactor[] = RISK_FACTORS.map((factor) => ({
      ...factor,
      detected: this.detectRiskFactor(factor.name, files, stats),
    }));

    const score = factors.filter((f) => f.detected).reduce((sum, f) => sum + f.weight, 0);

    let level: RiskAssessment['level'];
    if (score >= 60) level = 'critical';
    else if (score >= 40) level = 'high';
    else if (score >= 20) level = 'medium';
    else level = 'low';

    return { level, score, factors };
  }

  private detectRiskFactor(name: string, files: FileChange[], stats: PRStats): boolean {
    switch (name) {
      case 'large_change':
        return stats.totalAdditions + stats.totalDeletions > 500;
      case 'many_files':
        return files.length > 10;
      case 'security_sensitive':
        return files.some((f) => SECURITY_PATTERNS.some((p) => p.test(f.path)));
      case 'database_changes':
        return files.some((f) => DATABASE_PATTERNS.some((p) => p.test(f.path)));
      case 'api_changes':
        return files.some((f) => API_PATTERNS.some((p) => p.test(f.path)));
      case 'config_changes':
        return files.some((f) => CATEGORY_PATTERNS.config.some((p) => p.test(f.path)));
      case 'no_tests':
        return !files.some((f) => CATEGORY_PATTERNS.test.some((p) => p.test(f.path)));
      default:
        return false;
    }
  }

  // ============================================================================
  // Private Methods - Content Generation
  // ============================================================================

  private generateTitle(groups: FileGroup[], stats: PRStats): string {
    const primaryCategory = groups[0]?.category ?? 'other';
    const emoji = CATEGORY_EMOJI[primaryCategory];
    return `${emoji} PR Summary: ${stats.totalFiles} files, +${stats.totalAdditions}/-${stats.totalDeletions} lines`;
  }

  private generateOverview(groups: FileGroup[], stats: PRStats, risk: RiskAssessment): string {
    const categories = groups
      .filter((g) => g.files.length > 0)
      .map(
        (g) => `${CATEGORY_EMOJI[g.category]} ${CATEGORY_LABELS[g.category]} (${g.files.length})`
      )
      .join(', ');

    return (
      `This PR modifies **${stats.totalFiles} files** with ` +
      `**+${stats.totalAdditions}** additions and **-${stats.totalDeletions}** deletions. ` +
      `\n\n**Categories:** ${categories}` +
      `\n\n**Risk Level:** ${risk.level.toUpperCase()} (${risk.score}/100)`
    );
  }

  private async generateInsights(
    changedFiles: ChangedFile[],
    chunks: CodeChunk[]
  ): Promise<string[]> {
    if (!this.aiProvider || chunks.length === 0) {
      return [];
    }

    try {
      const fileList = changedFiles.map((f) => `- ${f.path} (${f.status})`).join('\n');
      const prompt = `Analyze these code changes and provide 3-5 key insights about the PR:

Files changed:
${fileList}

Provide insights about:
1. Main purpose of the changes
2. Potential impact areas
3. Quality observations
4. Any recommendations

Keep each insight to one sentence.`;

      const result = await this.aiProvider.reviewCode(
        [
          {
            id: 'insights',
            name: 'PR Analysis',
            type: 'analysis',
            file: 'summary',
            startLine: 1,
            endLine: 1,
            content: prompt,
          },
        ],
        ['Provide brief, actionable insights about this PR.']
      );

      // Parse insights from summary
      if (result.summary) {
        return result.summary
          .split('\n')
          .filter((line) => line.trim())
          .slice(0, 5);
      }
    } catch {
      // Silently fail - insights are optional
    }

    return [];
  }

  private determineRecommendation(risk: RiskAssessment, stats: PRStats): SummaryRecommendation {
    if (risk.level === 'critical') return 'block';
    if (risk.level === 'high') return 'request_changes';
    if (risk.level === 'medium' || stats.totalFiles > 5) return 'review_carefully';
    return 'approve';
  }

  private buildWalkthroughSections(
    summary: PRSummary,
    options: SummaryOptions
  ): WalkthroughSection[] {
    const sections: WalkthroughSection[] = [];

    for (const group of summary.changeGroups) {
      if (group.files.length === 0) continue;

      sections.push({
        title: CATEGORY_LABELS[group.category],
        emoji: CATEGORY_EMOJI[group.category],
        content: group.summary,
        files: group.files.map((f) => f.path),
        collapsed: options.collapsible && group.files.length > 3,
      });
    }

    return sections;
  }

  // ============================================================================
  // Private Methods - Formatting
  // ============================================================================

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'added':
        return '➕';
      case 'modified':
        return '📝';
      case 'deleted':
        return '🗑️';
      case 'renamed':
        return '📋';
      default:
        return '📄';
    }
  }

  private getRiskEmoji(level: string): string {
    switch (level) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  }

  private formatRecommendation(rec: SummaryRecommendation): string {
    switch (rec) {
      case 'approve':
        return '✅ **APPROVE** - This PR looks good to merge.';
      case 'review_carefully':
        return '👀 **REVIEW CAREFULLY** - Please review the changes thoroughly before merging.';
      case 'request_changes':
        return '⚠️ **REQUEST CHANGES** - Some issues should be addressed before merging.';
      case 'block':
        return '🛑 **BLOCK** - Critical issues detected. Do not merge until resolved.';
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSummaryBuilder(
  config: Config,
  aiProvider?: AIProviderInterface
): SummaryBuilder {
  return new SummaryBuilder(config, aiProvider);
}
