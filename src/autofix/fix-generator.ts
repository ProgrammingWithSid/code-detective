/**
 * Fix Generator - Generates code fixes for review comments
 *
 * Uses AI and pattern matching to suggest fixes
 */

import {
  CodeFix,
  FixSuggestion,
  FixGeneratorOptions,
  FixGenerationContext,
  FixGenerationResult,
  FixGenerationStats,
  FixConfidence,
  COMMON_FIX_PATTERNS,
  DEFAULT_FIX_OPTIONS,
} from '../types/autofix';
import { ReviewComment, Severity } from '../types';

export class FixGenerator {
  private options: FixGeneratorOptions;
  private idCounter: number = 0;

  constructor(options: FixGeneratorOptions = {}) {
    this.options = { ...DEFAULT_FIX_OPTIONS, ...options };
  }

  /**
   * Generate fixes for review comments
   */
  generateFixes(context: FixGenerationContext): FixGenerationResult {
    const startTime = Date.now();
    const suggestions: FixSuggestion[] = [];
    const unfixable: Array<{ comment: ReviewComment; reason: string }> = [];

    for (const comment of context.comments) {
      try {
        const fix = this.generateFixForComment(comment, context);

        if (fix) {
          suggestions.push(fix);
        } else {
          unfixable.push({
            comment,
            reason: 'Could not determine appropriate fix',
          });
        }
      } catch (error) {
        unfixable.push({
          comment,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Apply max fixes limit
    const limitedSuggestions = suggestions.slice(0, this.options.maxFixesPerFile);

    const stats = this.calculateStats(
      context.comments,
      limitedSuggestions,
      unfixable,
      Date.now() - startTime
    );

    return {
      suggestions: limitedSuggestions,
      unfixable,
      stats,
    };
  }

  /**
   * Generate fix for a single comment
   */
  private generateFixForComment(
    comment: ReviewComment,
    context: FixGenerationContext
  ): FixSuggestion | null {
    const line = comment.line;
    const lines = context.fileContent.split('\n');

    // Get the code at the comment location
    const startLine = Math.max(0, line - 3);
    const endLine = Math.min(lines.length, line + 2);
    const relevantCode = lines.slice(startLine, endLine).join('\n');
    const targetLine = lines[line - 1] || '';

    // Try pattern-based fix first
    const patternFix = this.tryPatternFix(comment, targetLine, context.language);
    if (patternFix) {
      return patternFix;
    }

    // Try heuristic-based fix
    const heuristicFix = this.tryHeuristicFix(comment, targetLine, relevantCode, context);
    if (heuristicFix) {
      return heuristicFix;
    }

    // Generate AI-based fix if API key available
    if (this.options.apiKey) {
      return this.generateAIFix(comment, relevantCode, context);
    }

    return null;
  }

  /**
   * Try to generate fix using predefined patterns
   */
  private tryPatternFix(
    comment: ReviewComment,
    targetLine: string,
    language: string
  ): FixSuggestion | null {
    const category = (comment as unknown as { category?: string }).category?.toLowerCase() || '';
    const message = comment.body.toLowerCase();

    for (const pattern of COMMON_FIX_PATTERNS) {
      // Check if pattern applies to this language
      if (!pattern.languages.includes(language)) continue;

      // Check if pattern matches the category or message
      const categoryMatch = pattern.categories.some(
        (c) => category.includes(c) || message.includes(c)
      );

      if (!categoryMatch) continue;

      // Check confidence threshold
      if (!this.meetsConfidenceThreshold(pattern.confidence)) continue;

      // Try to apply the pattern
      const regex =
        typeof pattern.match === 'string' ? new RegExp(pattern.match, 'g') : pattern.match;

      if (regex.test(targetLine)) {
        const fixedLine = targetLine.replace(regex, pattern.replacement);

        if (fixedLine !== targetLine) {
          const fix = this.createFix({
            filePath: comment.file,
            startLine: comment.line,
            endLine: comment.line,
            originalCode: targetLine,
            fixedCode: fixedLine,
            description: pattern.description,
            category: pattern.categories[0] || 'general',
            severity: comment.severity,
            confidence: pattern.confidence,
            isAutoApplicable: pattern.autoApplicable,
          });

          return {
            comment,
            fix,
            explanation: `Applied "${pattern.name}" pattern: ${pattern.description}`,
          };
        }
      }
    }

    return null;
  }

  /**
   * Try to generate fix using heuristics
   */
  private tryHeuristicFix(
    comment: ReviewComment,
    targetLine: string,
    _relevantCode: string,
    context: FixGenerationContext
  ): FixSuggestion | null {
    const message = comment.body.toLowerCase();
    const isTS = context.language === 'typescript';

    // Null check heuristic
    if (message.includes('null') || message.includes('undefined')) {
      const match = targetLine.match(/(\w+)\.(\w+)/);
      if (match) {
        const fixedLine = targetLine.replace(
          new RegExp(`${match[1]}\\.${match[2]}`, 'g'),
          `${match[1]}?.${match[2]}`
        );

        if (fixedLine !== targetLine) {
          return this.createSuggestion(
            comment,
            {
              filePath: comment.file,
              startLine: comment.line,
              endLine: comment.line,
              originalCode: targetLine,
              fixedCode: fixedLine,
              description: 'Add optional chaining to prevent null/undefined errors',
              category: 'safety',
              severity: comment.severity,
              confidence: 'high',
              isAutoApplicable: true,
            },
            'Added optional chaining operator (?.) for safe property access'
          );
        }
      }
    }

    // Unused variable heuristic
    if (message.includes('unused') && message.includes('variable')) {
      const match = targetLine.match(/(?:const|let|var)\s+(\w+)/);
      if (match) {
        // Suggest prefixing with underscore
        const fixedLine = targetLine.replace(new RegExp(`\\b${match[1]}\\b`), `_${match[1]}`);

        return this.createSuggestion(
          comment,
          {
            filePath: comment.file,
            startLine: comment.line,
            endLine: comment.line,
            originalCode: targetLine,
            fixedCode: fixedLine,
            description: 'Prefix unused variable with underscore',
            category: 'style',
            severity: 'info',
            confidence: 'medium',
            isAutoApplicable: true,
          },
          'Prefixed unused variable with underscore to indicate intentional non-use'
        );
      }
    }

    // Missing type annotation (TypeScript)
    if (isTS && (message.includes('type') || message.includes('any'))) {
      const match = targetLine.match(/(?:const|let)\s+(\w+)\s*=\s*(.+)/);
      if (match && match[1] && match[2] && !targetLine.includes(':')) {
        const varName = match[1];
        const varValue = match[2];
        const inferredType = this.inferType(varValue);

        return this.createSuggestion(
          comment,
          {
            filePath: comment.file,
            startLine: comment.line,
            endLine: comment.line,
            originalCode: targetLine,
            fixedCode: `const ${varName}: ${inferredType} = ${varValue}`,
            description: 'Add explicit type annotation',
            category: 'typescript',
            severity: 'info',
            confidence: 'medium',
            isAutoApplicable: false,
            safetyNotes: ['Verify the inferred type is correct'],
          },
          `Added type annotation. Inferred type: ${inferredType}`
        );
      }
    }

    // console.log removal
    if (message.includes('console') || message.includes('debug')) {
      if (targetLine.includes('console.log')) {
        return this.createSuggestion(
          comment,
          {
            filePath: comment.file,
            startLine: comment.line,
            endLine: comment.line,
            originalCode: targetLine,
            fixedCode: '',
            description: 'Remove console.log statement',
            category: 'cleanup',
            severity: 'info',
            confidence: 'high',
            isAutoApplicable: true,
          },
          'Removed debug console.log statement'
        );
      }
    }

    // Empty catch block
    if (message.includes('empty') && message.includes('catch')) {
      if (targetLine.includes('catch') && targetLine.includes('{}')) {
        const fixedLine = targetLine.replace(
          /catch\s*\([^)]*\)\s*\{\s*\}/,
          'catch (error) {\n    console.error(error);\n    throw error;\n  }'
        );

        return this.createSuggestion(
          comment,
          {
            filePath: comment.file,
            startLine: comment.line,
            endLine: comment.line,
            originalCode: targetLine,
            fixedCode: fixedLine,
            description: 'Add error handling to empty catch block',
            category: 'error-handling',
            severity: comment.severity,
            confidence: 'medium',
            isAutoApplicable: false,
            safetyNotes: ['Review error handling strategy for this specific case'],
          },
          'Added basic error logging to empty catch block'
        );
      }
    }

    return null;
  }

  /**
   * Generate fix using AI
   */
  private generateAIFix(
    _comment: ReviewComment,
    _relevantCode: string,
    _context: FixGenerationContext
  ): FixSuggestion | null {
    // This would call the AI provider to generate a fix
    // For now, return null as we don't have actual API integration here

    // In production, this would:
    // 1. Build a prompt with the code and comment
    // 2. Call the AI API to get a suggested fix
    // 3. Parse and validate the response
    // 4. Return the fix suggestion

    return null;
  }

  /**
   * Infer type from value
   */
  private inferType(value: string): string {
    const trimmed = value.trim();

    if (trimmed === 'true' || trimmed === 'false') return 'boolean';
    if (/^['"`]/.test(trimmed)) return 'string';
    if (/^\d+$/.test(trimmed)) return 'number';
    if (/^\d+\.\d+$/.test(trimmed)) return 'number';
    if (trimmed.startsWith('[')) return 'unknown[]';
    if (trimmed.startsWith('{')) return 'Record<string, unknown>';
    if (trimmed === 'null') return 'null';
    if (trimmed === 'undefined') return 'undefined';
    if (trimmed.includes('=>')) return '() => unknown';
    if (trimmed.startsWith('new ')) {
      const match = trimmed.match(/new\s+(\w+)/);
      return match && match[1] ? match[1] : 'unknown';
    }

    return 'unknown';
  }

  /**
   * Check if confidence meets threshold
   */
  private meetsConfidenceThreshold(confidence: FixConfidence): boolean {
    const order: FixConfidence[] = ['low', 'medium', 'high'];
    const threshold = this.options.minConfidence || 'medium';

    return order.indexOf(confidence) >= order.indexOf(threshold);
  }

  /**
   * Create a fix object
   */
  private createFix(params: {
    filePath: string;
    startLine: number;
    endLine: number;
    originalCode: string;
    fixedCode: string;
    description: string;
    category: string;
    severity: Severity;
    confidence: FixConfidence;
    isAutoApplicable: boolean;
    safetyNotes?: string[];
    dependenciesToAdd?: string[];
    importsToAdd?: string[];
  }): CodeFix {
    const fixType = params.originalCode ? (params.fixedCode ? 'replace' : 'delete') : 'insert';
    return {
      id: `fix-${++this.idCounter}`,
      type: fixType,
      filePath: params.filePath,
      startLine: params.startLine,
      endLine: params.endLine,
      originalCode: params.originalCode,
      fixedCode: params.fixedCode,
      description: params.description,
      category: params.category,
      severity: params.severity,
      confidence: params.confidence,
      isAutoApplicable: params.isAutoApplicable,
      safetyNotes: params.safetyNotes,
      dependenciesToAdd: params.dependenciesToAdd,
      importsToAdd: params.importsToAdd,
    };
  }

  /**
   * Create a fix suggestion
   */
  private createSuggestion(
    comment: ReviewComment,
    fixParams: Omit<CodeFix, 'id' | 'type'> & { type?: CodeFix['type'] },
    explanation: string
  ): FixSuggestion {
    const fix = this.createFix(fixParams as Parameters<typeof this.createFix>[0]);

    return {
      comment,
      fix,
      explanation,
    };
  }

  /**
   * Calculate generation statistics
   */
  private calculateStats(
    comments: ReviewComment[],
    suggestions: FixSuggestion[],
    unfixable: Array<{ comment: ReviewComment; reason: string }>,
    generationTime: number
  ): FixGenerationStats {
    const byConfidence = suggestions.reduce(
      (acc, s) => {
        acc[s.fix.confidence]++;
        return acc;
      },
      { high: 0, medium: 0, low: 0 } as Record<FixConfidence, number>
    );

    return {
      totalComments: comments.length,
      fixesGenerated: suggestions.length,
      highConfidence: byConfidence.high,
      mediumConfidence: byConfidence.medium,
      lowConfidence: byConfidence.low,
      unfixableCount: unfixable.length,
      generationTime,
    };
  }
}

/**
 * Factory function
 */
export function createFixGenerator(options?: FixGeneratorOptions): FixGenerator {
  return new FixGenerator(options);
}
