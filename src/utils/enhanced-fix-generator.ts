import { ReviewComment, CodeChunk } from '../types';
import { AIProviderInterface } from '../ai-provider';

/**
 * Enhanced fix generation using AI for better code suggestions
 */
export interface EnhancedFixOptions {
  /** Use AI for fix generation */
  useAI: boolean;
  /** AI provider for generating fixes */
  aiProvider?: AIProviderInterface;
  /** Minimum confidence for applying fixes */
  minConfidence: number;
}

/**
 * Enhanced fix generator with AI-powered suggestions
 */
export class EnhancedFixGenerator {
  private options: EnhancedFixOptions;

  constructor(options: Partial<EnhancedFixOptions> = {}) {
    this.options = {
      useAI: options.useAI ?? false,
      minConfidence: options.minConfidence ?? 0.7,
      ...options,
    };
  }

  /**
   * Generate enhanced fix using AI
   */
  generateAIFix(
    comment: ReviewComment,
    chunk: CodeChunk,
    context: CodeChunk[]
  ): Promise<{ fix: string; confidence: number } | null> {
    if (!this.options.useAI || !this.options.aiProvider) {
      return Promise.resolve(null);
    }

    try {
      const prompt = this.buildFixPrompt(comment, chunk, context);

      // Use AI to generate fix
      // Note: This would need to be adapted based on your AI provider interface
      // For now, return a structured fix suggestion
      const fix = this.generateFixWithAI(prompt, comment, chunk);

      return Promise.resolve(fix);
    } catch (error) {
      console.error('AI fix generation failed:', error);
      return Promise.resolve(null);
    }
  }

  /**
   * Build prompt for AI fix generation
   */
  private buildFixPrompt(comment: ReviewComment, chunk: CodeChunk, context: CodeChunk[]): string {
    let prompt = `Generate a code fix for the following issue:\n\n`;
    prompt += `**Issue:** ${comment.body}\n`;
    prompt += `**File:** ${comment.file}\n`;
    prompt += `**Line:** ${comment.line}\n`;
    prompt += `**Severity:** ${comment.severity}\n\n`;

    if (comment.category) {
      prompt += `**Category:** ${comment.category}\n`;
    }

    prompt += `\n**Current Code:**\n\`\`\`\n${chunk.content}\n\`\`\`\n\n`;

    if (context.length > 0) {
      prompt += `**Context (related code):**\n`;
      context.slice(0, 3).forEach((ctx) => {
        prompt += `\`\`\`\n${ctx.content}\n\`\`\`\n`;
      });
    }

    prompt += `\n**Requirements:**\n`;
    prompt += `- Generate a complete, working fix\n`;
    prompt += `- Maintain code style and patterns\n`;
    prompt += `- Include necessary imports if needed\n`;
    prompt += `- Ensure the fix addresses the issue\n`;
    prompt += `- Return only the fixed code, no explanations\n`;

    return prompt;
  }

  /**
   * Generate fix using AI provider
   */
  private generateFixWithAI(
    _prompt: string,
    comment: ReviewComment,
    chunk: CodeChunk
  ): { fix: string; confidence: number } | null {
    // This is a placeholder - would need to integrate with actual AI provider
    // For now, return pattern-based fix
    return this.generatePatternBasedFix(comment, chunk);
  }

  /**
   * Generate pattern-based fix as fallback
   */
  private generatePatternBasedFix(
    comment: ReviewComment,
    chunk: CodeChunk
  ): { fix: string; confidence: number } | null {
    const lines = chunk.content.split('\n');
    const issueLine = comment.line - chunk.startLine;

    if (issueLine < 0 || issueLine >= lines.length) {
      return null;
    }

    const originalLine = lines[issueLine];
    if (!originalLine) {
      return null;
    }

    let fixedLine = originalLine;
    let confidence = 0.5;

    // Pattern-based fixes
    if (comment.rule === 'no-console') {
      fixedLine = `// ${originalLine}`; // Comment out
      confidence = 0.8;
    } else if (comment.rule === 'eqeqeq') {
      fixedLine = originalLine.replace(/==/g, '===').replace(/!=/g, '!==');
      confidence = 0.9;
    } else if (comment.rule === 'no-var') {
      fixedLine = originalLine.replace(/\bvar\b/g, 'const');
      confidence = 0.85;
    } else if (comment.rule === 'no-empty-catch') {
      fixedLine = originalLine.replace(
        /catch\s*\([^)]*\)\s*\{\s*\}/,
        'catch (error) {\n    console.error(error);\n  }'
      );
      confidence = 0.7;
    } else if (comment.fix) {
      // Use provided fix
      fixedLine = comment.fix;
      confidence = 0.75;
    } else {
      return null;
    }

    // Replace the line
    lines[issueLine] = fixedLine;
    const fixedCode = lines.join('\n');

    return {
      fix: fixedCode,
      confidence,
    };
  }

  /**
   * Validate generated fix
   */
  validateFix(
    originalCode: string,
    fixedCode: string,
    comment: ReviewComment
  ): { valid: boolean; reason?: string } {
    // Basic validation
    if (!fixedCode || fixedCode.trim().length === 0) {
      return { valid: false, reason: 'Fix is empty' };
    }

    if (fixedCode === originalCode) {
      return { valid: false, reason: 'Fix is identical to original' };
    }

    // Check if fix addresses the issue
    if (comment.rule === 'no-console' && fixedCode.includes('console.')) {
      return { valid: false, reason: 'Fix still contains console statement' };
    }

    if (comment.rule === 'eqeqeq' && fixedCode.includes(' == ')) {
      return { valid: false, reason: 'Fix still uses loose equality' };
    }

    return { valid: true };
  }

  /**
   * Generate multiple fix options
   */
  async generateFixOptions(
    comment: ReviewComment,
    chunk: CodeChunk,
    context: CodeChunk[]
  ): Promise<Array<{ fix: string; confidence: number; description: string }>> {
    const options: Array<{
      fix: string;
      confidence: number;
      description: string;
    }> = [];

    // Option 1: Pattern-based fix
    const patternFix = this.generatePatternBasedFix(comment, chunk);
    if (patternFix) {
      options.push({
        ...patternFix,
        description: 'Pattern-based fix',
      });
    }

    // Option 2: AI-generated fix (if enabled)
    if (this.options.useAI) {
      const aiFix = await this.generateAIFix(comment, chunk, context);
      if (aiFix && aiFix.confidence >= this.options.minConfidence) {
        options.push({
          ...aiFix,
          description: 'AI-generated fix',
        });
      }
    }

    // Option 3: Use provided fix if available
    if (comment.fix) {
      options.push({
        fix: comment.fix,
        confidence: 0.8,
        description: 'Reviewer-suggested fix',
      });
    }

    // Sort by confidence
    return options.sort((a, b) => b.confidence - a.confidence);
  }
}
