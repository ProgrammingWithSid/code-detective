/**
 * Auto-Fix Service - Main service for generating and applying fixes
 *
 * Orchestrates fix generation, validation, and application
 */

import {
  AutoFixService,
  CodeFix,
  FixSuggestion,
  FixGenerationContext,
  FixGenerationResult,
  FixApplicationOptions,
  FixApplicationResult,
  FixValidation,
  FixDiff,
  FixGeneratorOptions,
} from '../types/autofix';
import { ReviewComment } from '../types';
import { FixGenerator, createFixGenerator } from './fix-generator';
import { FixApplier, createFixApplier } from './fix-applier';

export interface AutoFixOptions {
  /** Fix generation options */
  generatorOptions?: FixGeneratorOptions;
  /** Fix application options */
  applierOptions?: FixApplicationOptions;
}

export class AutoFix implements AutoFixService {
  private generator: FixGenerator;
  private applier: FixApplier;

  constructor(options: AutoFixOptions = {}) {
    this.generator = createFixGenerator(options.generatorOptions);
    this.applier = createFixApplier(options.applierOptions);
  }

  /**
   * Generate fixes for review comments
   */
  generateFixes(context: FixGenerationContext): FixGenerationResult {
    return this.generator.generateFixes(context);
  }

  /**
   * Apply fixes to files
   */
  applyFixes(fixes: CodeFix[], options?: FixApplicationOptions): FixApplicationResult {
    // Create a map of file contents
    const fileContents = new Map<string, string>();

    // In a real implementation, we'd read the files from disk
    // For now, we'll use a placeholder that expects content to be passed in
    // The actual file reading should happen in the calling code

    const applier = options ? createFixApplier(options) : this.applier;
    return applier.applyFixes(fixes, fileContents);
  }

  /**
   * Apply fixes with file contents provided
   */
  applyFixesWithContent(
    fixes: CodeFix[],
    fileContents: Map<string, string>,
    options?: FixApplicationOptions
  ): FixApplicationResult {
    const applier = options ? createFixApplier(options) : this.applier;
    return applier.applyFixes(fixes, fileContents);
  }

  /**
   * Validate fixes before applying
   */
  validateFixes(fixes: CodeFix[], fileContent: string): Map<string, FixValidation> {
    const validations = new Map<string, FixValidation>();

    for (const fix of fixes) {
      const validation = this.applier.validateFix(fix, fileContent);
      validations.set(fix.id, validation);
    }

    return validations;
  }

  /**
   * Generate diff for fixes
   */
  generateDiff(fixes: CodeFix[], fileContent: string): FixDiff {
    return this.applier.generateDiff(fixes, fileContent);
  }

  /**
   * Format fix suggestions as markdown
   */
  formatAsMarkdown(suggestions: FixSuggestion[]): string {
    if (suggestions.length === 0) {
      return 'No fix suggestions available.';
    }

    const lines: string[] = [];
    lines.push('## 🔧 Suggested Fixes\n');

    const byFile = this.groupByFile(suggestions);

    for (const [filePath, fileSuggestions] of byFile) {
      lines.push(`### 📄 \`${filePath}\`\n`);

      for (const suggestion of fileSuggestions) {
        const { fix, explanation, comment } = suggestion;
        const confidenceEmoji = this.getConfidenceEmoji(fix.confidence);
        const autoApplyBadge = fix.isAutoApplicable
          ? '✅ Auto-applicable'
          : '⚠️ Manual review needed';

        lines.push(`#### Line ${fix.startLine}: ${fix.description}\n`);
        lines.push(`${confidenceEmoji} Confidence: **${fix.confidence}** | ${autoApplyBadge}\n`);

        if (comment) {
          lines.push(`> Original issue: ${comment.body}\n`);
        }

        lines.push('**Before:**');
        lines.push('```' + this.getLanguage(filePath));
        lines.push(fix.originalCode || '(no code)');
        lines.push('```\n');

        lines.push('**After:**');
        lines.push('```' + this.getLanguage(filePath));
        lines.push(fix.fixedCode || '(code removed)');
        lines.push('```\n');

        lines.push(`💡 ${explanation}\n`);

        if (fix.safetyNotes && fix.safetyNotes.length > 0) {
          lines.push('⚠️ **Safety Notes:**');
          for (const note of fix.safetyNotes) {
            lines.push(`- ${note}`);
          }
          lines.push('');
        }

        if (suggestion.sideEffects && suggestion.sideEffects.length > 0) {
          lines.push('🔄 **Potential Side Effects:**');
          for (const effect of suggestion.sideEffects) {
            lines.push(`- ${effect}`);
          }
          lines.push('');
        }

        lines.push('---\n');
      }
    }

    // Summary
    lines.push('### 📊 Summary\n');
    const stats = this.calculateSummaryStats(suggestions);
    lines.push(`- **Total fixes:** ${suggestions.length}`);
    lines.push(`- **High confidence:** ${stats.high}`);
    lines.push(`- **Medium confidence:** ${stats.medium}`);
    lines.push(`- **Low confidence:** ${stats.low}`);
    lines.push(`- **Auto-applicable:** ${stats.autoApplicable}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format as GitHub suggestion comment
   */
  formatAsGitHubSuggestion(fix: CodeFix): string {
    const lines: string[] = [];

    lines.push(`**${fix.description}**`);
    lines.push('');
    lines.push('```suggestion');
    lines.push(fix.fixedCode);
    lines.push('```');
    lines.push('');
    lines.push(`Confidence: ${this.getConfidenceEmoji(fix.confidence)} ${fix.confidence}`);

    if (fix.safetyNotes && fix.safetyNotes.length > 0) {
      lines.push('');
      lines.push('⚠️ ' + fix.safetyNotes.join(', '));
    }

    return lines.join('\n');
  }

  /**
   * Get quick fixes for a specific comment
   */
  getQuickFixes(comment: ReviewComment, fileContent: string, language: string): FixSuggestion[] {
    const result = this.generateFixes({
      filePath: comment.file,
      fileContent,
      language,
      comments: [comment],
    });

    return result.suggestions;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private groupByFile(suggestions: FixSuggestion[]): Map<string, FixSuggestion[]> {
    const grouped = new Map<string, FixSuggestion[]>();

    for (const suggestion of suggestions) {
      const filePath = suggestion.fix.filePath;
      const existing = grouped.get(filePath) || [];
      existing.push(suggestion);
      grouped.set(filePath, existing);
    }

    return grouped;
  }

  private getConfidenceEmoji(confidence: string): string {
    switch (confidence) {
      case 'high':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'low':
        return '🔴';
      default:
        return '⚪';
    }
  }

  private getLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      rb: 'ruby',
      vue: 'vue',
    };
    return map[ext || ''] || '';
  }

  private calculateSummaryStats(suggestions: FixSuggestion[]): {
    high: number;
    medium: number;
    low: number;
    autoApplicable: number;
  } {
    return {
      high: suggestions.filter((s) => s.fix.confidence === 'high').length,
      medium: suggestions.filter((s) => s.fix.confidence === 'medium').length,
      low: suggestions.filter((s) => s.fix.confidence === 'low').length,
      autoApplicable: suggestions.filter((s) => s.fix.isAutoApplicable).length,
    };
  }
}

/**
 * Factory function
 */
export function createAutoFix(options?: AutoFixOptions): AutoFix {
  return new AutoFix(options);
}

/**
 * Create auto-fix service with default options
 */
export function createDefaultAutoFix(): AutoFix {
  return new AutoFix({
    generatorOptions: {
      maxFixesPerFile: 10,
      includeAlternatives: true,
      minConfidence: 'medium',
      validateFixes: true,
    },
    applierOptions: {
      createBackup: true,
      autoApplicableOnly: true,
      minConfidence: 'high',
      dryRun: false,
      validateSyntax: true,
    },
  });
}
