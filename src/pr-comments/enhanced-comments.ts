/**
 * Enhanced PR Comments - CodeRabbit-like features
 *
 * Features:
 * - Code suggestions with diff blocks
 * - Auto-fix buttons
 * - Review decisions (approve/request changes/comment)
 * - Visual indicators
 */

import { ReviewComment, ReviewResult, Severity } from '../types';

// ============================================================================
// Types
// ============================================================================

export type ReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface CodeSuggestion {
  /** Original code */
  original: string;
  /** Suggested replacement */
  suggested: string;
  /** Line number */
  line: number;
  /** Explanation */
  explanation: string;
}

export interface EnhancedReviewComment extends ReviewComment {
  /** Code suggestion if applicable */
  codeSuggestion?: CodeSuggestion;
  /** Whether this can be auto-fixed */
  autoFixable?: boolean;
  /** Auto-fix command if applicable */
  autoFixCommand?: string;
  /** Related issues/PRs */
  relatedIssues?: Array<{ number: number; url: string }>;
  /** Confidence score (0-1) */
  confidence?: number;
}

export interface ReviewDecisionResult {
  decision: ReviewDecision;
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments: EnhancedReviewComment[];
}

// ============================================================================
// Enhanced Comments Builder
// ============================================================================

export class EnhancedCommentsBuilder {
  /**
   * Build enhanced comment with code suggestion
   */
  static buildEnhancedComment(
    comment: ReviewComment,
    codeSuggestion?: CodeSuggestion,
    autoFixable: boolean = false
  ): EnhancedReviewComment {
    return {
      ...comment,
      codeSuggestion,
      autoFixable,
      autoFixCommand: autoFixable ? this.generateAutoFixCommand(comment) : undefined,
      confidence: this.calculateConfidence(comment),
    };
  }

  /**
   * Format comment with code suggestion as markdown
   */
  static formatCommentWithSuggestion(comment: EnhancedReviewComment): string {
    let body = `**${this.getSeverityEmoji(comment.severity)} ${comment.severity.toUpperCase()}**`;

    if (comment.category) {
      body += ` • ${comment.category}`;
    }

    body += `\n\n${comment.body}\n`;

    if (comment.codeSuggestion) {
      body += `\n**💡 Suggestion:**\n\n`;
      body += `\`\`\`diff\n`;
      body += `- ${comment.codeSuggestion.original}\n`;
      body += `+ ${comment.codeSuggestion.suggested}\n`;
      body += `\`\`\`\n`;

      if (comment.codeSuggestion.explanation) {
        body += `\n*${comment.codeSuggestion.explanation}*\n`;
      }
    }

    if (comment.fix) {
      body += `\n**🔧 Fix:**\n${comment.fix}\n`;
    }

    if (comment.autoFixable) {
      body += `\n---\n`;
      body += `\n**✨ Auto-fix available** - Use the command below to apply:\n`;
      body += `\`\`\`bash\n${comment.autoFixCommand}\n\`\`\`\n`;
    }

    if (comment.rule) {
      body += `\n<details>\n<summary>Rule: ${comment.rule}</summary>\n`;
      body += `This issue was detected by rule: \`${comment.rule}\`\n`;
      body += `</details>\n`;
    }

    return body;
  }

  /**
   * Build review decision based on review results
   */
  static buildReviewDecision(result: ReviewResult): ReviewDecisionResult {
    const errors = result.comments.filter((c) => c.severity === 'error');
    const warnings = result.comments.filter((c) => c.severity === 'warning');
    const suggestions = result.comments.filter(
      (c) => c.severity === 'suggestion' || c.severity === 'info'
    );

    let decision: ReviewDecision;
    let event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

    if (errors.length > 0) {
      decision = 'REQUEST_CHANGES';
      event = 'REQUEST_CHANGES';
    } else if (warnings.length > 3) {
      decision = 'REQUEST_CHANGES';
      event = 'REQUEST_CHANGES';
    } else if (warnings.length > 0 || suggestions.length > 0) {
      decision = 'COMMENT';
      event = 'COMMENT';
    } else {
      decision = 'APPROVE';
      event = 'APPROVE';
    }

    const body = this.buildReviewBody(result, decision, errors, warnings, suggestions);

    return {
      decision,
      body,
      event,
      comments: result.comments.map((c) => this.buildEnhancedComment(c)),
    };
  }

  /**
   * Build review body with summary
   */
  private static buildReviewBody(
    result: ReviewResult,
    decision: ReviewDecision,
    errors: ReviewComment[],
    warnings: ReviewComment[],
    suggestions: ReviewComment[]
  ): string {
    let body = '## 🔍 Code Review Summary\n\n';

    // Summary statistics
    body += `| Metric | Count |\n`;
    body += `|--------|-------|\n`;
    body += `| 🔴 Errors | ${errors.length} |\n`;
    body += `| 🟡 Warnings | ${warnings.length} |\n`;
    body += `| 💡 Suggestions | ${suggestions.length} |\n`;
    body += `| **Total Issues** | **${result.comments.length}** |\n\n`;

    // Decision
    body += `### Review Decision: `;
    switch (decision) {
      case 'APPROVE':
        body += `✅ **APPROVE**\n\n`;
        body += `Great work! The code looks good and is ready to merge.`;
        break;
      case 'REQUEST_CHANGES':
        body += `❌ **REQUEST CHANGES**\n\n`;
        body += `Please address the issues below before merging.`;
        break;
      case 'COMMENT':
        body += `💬 **COMMENT**\n\n`;
        body += `The code looks good overall. Please consider the suggestions below.`;
        break;
    }
    body += `\n\n`;

    // Top issues
    if (result.topIssues && result.topIssues.length > 0) {
      body += `### 🎯 Top Issues\n\n`;
      result.topIssues.forEach((issue, index) => {
        body += `${index + 1}. ${issue}\n`;
      });
      body += `\n`;
    }

    // Summary text
    if (result.summary) {
      body += `### 📝 Summary\n\n${result.summary}\n\n`;
    }

    // Quality metrics
    if (result.qualityMetrics) {
      body += `### 📊 Quality Metrics\n\n`;
      body += `- **Overall Score**: ${result.qualityMetrics.overallScore.toFixed(1)}/100\n`;
      body += `- **Accuracy**: ${result.qualityMetrics.accuracy.toFixed(1)}%\n`;
      body += `- **Actionability**: ${result.qualityMetrics.actionability.toFixed(1)}%\n`;
      body += `- **Coverage**: ${result.qualityMetrics.coverage.toFixed(1)}%\n\n`;
    }

    // Recommendation
    if (result.recommendation) {
      body += `### 💡 Recommendation\n\n${result.recommendation}\n\n`;
    }

    body += `---\n\n`;
    body += `*This review was generated by Code Sherlock*\n`;

    return body;
  }

  /**
   * Generate auto-fix command
   */
  private static generateAutoFixCommand(comment: ReviewComment): string {
    if (comment.category?.startsWith('linter-')) {
      const tool = comment.category.replace('linter-', '');
      if (tool === 'eslint') {
        return `npx eslint --fix ${comment.file}`;
      }
      if (tool === 'prettier') {
        return `npx prettier --write ${comment.file}`;
      }
    }

    if (comment.fix) {
      return comment.fix;
    }

    return `# Manual fix required for ${comment.file}:${comment.line}`;
  }

  /**
   * Calculate confidence score
   */
  private static calculateConfidence(comment: ReviewComment): number {
    let confidence = 0.7; // Base confidence

    // Higher confidence for linter/SAST tools
    if (comment.category?.startsWith('linter-') || comment.category?.startsWith('security-')) {
      confidence = 0.9;
    }

    // Lower confidence for suggestions
    if (comment.severity === 'suggestion' || comment.severity === 'info') {
      confidence = 0.6;
    }

    // Higher confidence for errors
    if (comment.severity === 'error') {
      confidence = 0.95;
    }

    return confidence;
  }

  /**
   * Get severity emoji
   */
  private static getSeverityEmoji(severity: Severity): string {
    const emojis: Record<Severity, string> = {
      error: '🔴',
      warning: '🟡',
      info: 'ℹ️',
      suggestion: '💡',
    };
    return emojis[severity] || '•';
  }
}
