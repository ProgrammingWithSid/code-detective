/**
 * Naming Analyzer - Analyzes code for poorly named functions, variables, classes, etc.
 * and suggests better names using AI
 */

import { AIProviderInterface } from '../ai-provider';
import { CodeChunk, NamingSuggestion } from '../types';

export interface NamingAnalyzerOptions {
  aiProvider: AIProviderInterface;
  enabled?: boolean;
}

export class NamingAnalyzer {
  private aiProvider: AIProviderInterface;
  private enabled: boolean;

  constructor(options: NamingAnalyzerOptions) {
    this.aiProvider = options.aiProvider;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Analyze chunks for naming issues and generate suggestions
   */
  async analyzeNaming(chunks: CodeChunk[]): Promise<NamingSuggestion[]> {
    if (!this.enabled || chunks.length === 0) {
      return [];
    }

    try {
      // Filter chunks to only functions, classes, and variables
      const relevantChunks = chunks.filter(
        (chunk) =>
          chunk.type === 'function' ||
          chunk.type === 'class' ||
          chunk.type === 'interface' ||
          chunk.type === 'variable' ||
          chunk.type === 'constant'
      );

      if (relevantChunks.length === 0) {
        return [];
      }

      // Call AI to analyze naming
      const prompt = this.createNamingPrompt(relevantChunks);
      const response = await this.aiProvider.reviewCode(relevantChunks, [prompt]);

      // Extract naming suggestions from comments
      const suggestions: NamingSuggestion[] = [];

      for (const comment of response.comments) {
        // Look for naming-related comments
        if (
          comment.category === 'code_quality' &&
          (comment.body.toLowerCase().includes('name') ||
            comment.body.toLowerCase().includes('naming') ||
            comment.rule?.toLowerCase().includes('naming'))
        ) {
          // Try to extract current name and suggested name from comment
          const namingMatch = this.extractNamingFromComment(
            comment.body,
            comment.file,
            comment.line
          );
          if (namingMatch) {
            suggestions.push(namingMatch);
          }
        }
      }

      // Also analyze chunks directly for naming patterns
      const directSuggestions = this.analyzeChunksDirectly(relevantChunks);
      suggestions.push(...directSuggestions);

      return this.deduplicateSuggestions(suggestions);
    } catch (error) {
      console.error('Error analyzing naming:', error);
      return [];
    }
  }

  /**
   * Create prompt for AI to analyze naming
   */
  private createNamingPrompt(chunks: CodeChunk[]): string {
    const chunkSummaries = chunks
      .map((chunk) => {
        const lines = chunk.content.split('\n').slice(0, 5).join('\n');
        return `File: ${chunk.file}:${chunk.startLine}\nType: ${chunk.type}\nName: ${chunk.name}\nCode:\n${lines}`;
      })
      .join('\n\n---\n\n');

    return `Analyze the following code identifiers and suggest better names for any that are poorly named.

Focus on:
- Functions with unclear or generic names (e.g., "do", "process", "handle", "data", "temp")
- Variables with single letters or abbreviations that aren't clear
- Classes/interfaces that don't clearly indicate their purpose
- Constants that don't follow naming conventions

For each poorly named identifier, provide:
1. Current name
2. Suggested name
3. Reason for the suggestion
4. Type (function, variable, class, interface, constant)

Code to analyze:
${chunkSummaries}

Return suggestions in JSON format matching the naming suggestion schema.`;
  }

  /**
   * Extract naming information from a comment
   */
  private extractNamingFromComment(
    commentBody: string,
    file: string,
    line: number
  ): NamingSuggestion | null {
    // Try to find patterns like "Consider renaming X to Y" or "X should be renamed to Y"
    const renamePatterns = [
      /(?:consider|suggest|recommend|should).*?renam(?:e|ing)\s+['"]?(\w+)['"]?\s+(?:to|as)\s+['"]?(\w+)['"]?/i,
      /['"]?(\w+)['"]?\s+(?:should|could)\s+be\s+renamed\s+(?:to|as)\s+['"]?(\w+)['"]?/i,
      /better\s+name.*?['"]?(\w+)['"]?\s+(?:would|should)\s+be\s+['"]?(\w+)['"]?/i,
    ];

    for (const pattern of renamePatterns) {
      const match = commentBody.match(pattern);
      if (match && match[1] && match[2]) {
        // Determine type from context
        const type = this.inferTypeFromComment(commentBody);

        return {
          file,
          line,
          currentName: match[1],
          suggestedName: match[2],
          type,
          reason: commentBody,
          severity: 'suggestion' as const,
        };
      }
    }

    return null;
  }

  /**
   * Infer the type of identifier from comment context
   */
  private inferTypeFromComment(comment: string): NamingSuggestion['type'] {
    const lowerComment = comment.toLowerCase();
    if (lowerComment.includes('function') || lowerComment.includes('method')) {
      return 'function';
    }
    if (lowerComment.includes('class')) {
      return 'class';
    }
    if (lowerComment.includes('interface')) {
      return 'interface';
    }
    if (lowerComment.includes('constant') || lowerComment.includes('const')) {
      return 'constant';
    }
    return 'variable';
  }

  /**
   * Analyze chunks directly for naming patterns
   */
  private analyzeChunksDirectly(chunks: CodeChunk[]): NamingSuggestion[] {
    const suggestions: NamingSuggestion[] = [];

    for (const chunk of chunks) {
      const name = chunk.name;

      // Skip if no name
      if (!name || name.length === 0) {
        continue;
      }

      // Check for common naming issues
      const issues = this.detectNamingIssues(name, chunk.type);

      if (issues.length > 0) {
        // Generate suggestion based on detected issues
        const suggestedName = this.generateSuggestedName(name, chunk.type, issues);
        if (suggestedName && suggestedName !== name) {
          suggestions.push({
            file: chunk.file,
            line: chunk.startLine,
            currentName: name,
            suggestedName,
            type: chunk.type as NamingSuggestion['type'],
            reason: issues.join('; '),
            severity: this.determineSeverity(issues),
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Detect naming issues in an identifier
   */
  private detectNamingIssues(name: string, type: string): string[] {
    const issues: string[] = [];

    // Single letter names (except common ones like i, j, k in loops)
    if (name.length === 1 && !['i', 'j', 'k', 'x', 'y', 'z'].includes(name.toLowerCase())) {
      issues.push('Single letter name is unclear');
    }

    // Generic names
    const genericNames = [
      'data',
      'temp',
      'tmp',
      'obj',
      'item',
      'value',
      'result',
      'thing',
      'stuff',
    ];
    if (genericNames.includes(name.toLowerCase())) {
      issues.push('Generic name does not describe purpose');
    }

    // Abbreviations that might be unclear
    if (name.length <= 3 && name === name.toUpperCase() && type !== 'constant') {
      issues.push('Abbreviation may be unclear');
    }

    // Names starting with numbers
    if (/^\d/.test(name)) {
      issues.push('Name starts with number');
    }

    // Very short names (2-3 chars) that aren't abbreviations
    if (name.length <= 3 && name !== name.toUpperCase() && type !== 'variable') {
      issues.push('Very short name may be unclear');
    }

    // Names with unclear prefixes/suffixes
    if (
      /^(do|handle|process|get|set|make|create|init|setup|cleanup)/i.test(name) &&
      name.length < 10
    ) {
      issues.push('Generic verb prefix without clear purpose');
    }

    return issues;
  }

  /**
   * Generate a suggested name based on issues
   */
  private generateSuggestedName(
    _currentName: string,
    _type: string,
    _issues: string[]
  ): string | null {
    // This is a simple heuristic - in practice, AI would generate better suggestions
    // For now, we'll just return null and let AI handle it through comments
    return null;
  }

  /**
   * Determine severity based on issues
   */
  private determineSeverity(issues: string[]): NamingSuggestion['severity'] {
    // Single letter or generic names are more severe
    if (issues.some((i) => i.includes('Single letter') || i.includes('Generic name'))) {
      return 'warning';
    }
    return 'suggestion';
  }

  /**
   * Deduplicate suggestions
   */
  private deduplicateSuggestions(suggestions: NamingSuggestion[]): NamingSuggestion[] {
    const seen = new Set<string>();
    const deduplicated: NamingSuggestion[] = [];

    for (const suggestion of suggestions) {
      const key = `${suggestion.file}:${suggestion.line}:${suggestion.currentName}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(suggestion);
      }
    }

    return deduplicated;
  }
}
