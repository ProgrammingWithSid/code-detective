/**
 * PR Title Analyzer - Analyzes PR changes and suggests better PR titles
 */

import { AIProviderInterface } from '../ai-provider';
import { ChangedFile, CodeChunk, PRTitleSuggestion } from '../types';

export interface PRTitleAnalyzerOptions {
  aiProvider: AIProviderInterface;
  enabled?: boolean;
}

export class PRTitleAnalyzer {
  private aiProvider: AIProviderInterface;
  private enabled: boolean;

  constructor(options: PRTitleAnalyzerOptions) {
    this.aiProvider = options.aiProvider;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Analyze PR changes and suggest a better title
   */
  async analyzePRTitle(
    currentTitle: string | undefined,
    changedFiles: ChangedFile[],
    chunks: CodeChunk[]
  ): Promise<PRTitleSuggestion | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      // Create a summary of changes
      const changeSummary = this.createChangeSummary(changedFiles, chunks);

      // Use AI to generate title suggestion
      // We'll create a temporary chunk with the change summary for AI analysis
      const summaryChunk: CodeChunk = {
        id: 'pr-summary',
        name: 'PR Summary',
        type: 'documentation',
        file: 'PR_CHANGES.md',
        startLine: 1,
        endLine: changeSummary.split('\n').length,
        content: changeSummary,
        extension: '.md',
        language: 'markdown',
      };

      // Create prompt for AI with detailed requirements
      const prompt = this.createTitlePrompt(currentTitle, changeSummary);

      const response = await this.aiProvider.reviewCode([summaryChunk], [prompt]);

      // Extract title suggestion from AI response
      const suggestedTitle = this.extractTitleFromResponse(
        response.summary,
        currentTitle,
        changeSummary
      );

      if (!suggestedTitle || suggestedTitle === currentTitle) {
        return null;
      }

      // Generate alternatives
      const alternatives = this.generateAlternatives(suggestedTitle, changeSummary);

      return {
        currentTitle,
        suggestedTitle,
        reason: this.generateReason(currentTitle, suggestedTitle, changeSummary),
        alternatives: alternatives.length > 0 ? alternatives : undefined,
      };
    } catch (error) {
      console.error('Error analyzing PR title:', error);
      return null;
    }
  }

  /**
   * Create a summary of changes
   */
  private createChangeSummary(changedFiles: ChangedFile[], chunks: CodeChunk[]): string {
    const fileTypes = changedFiles.map((f) => {
      const ext = f.path.split('.').pop()?.toLowerCase() || '';
      return ext;
    });

    const addedFiles = changedFiles.filter((f) => f.status === 'added').length;
    const modifiedFiles = changedFiles.filter((f) => f.status === 'modified').length;
    const deletedFiles = changedFiles.filter((f) => f.status === 'deleted').length;

    const chunkTypes = chunks.map((c) => c.type);
    const uniqueChunkTypes = [...new Set(chunkTypes)];

    const summary = [
      `Files changed: ${changedFiles.length} (${addedFiles} added, ${modifiedFiles} modified, ${deletedFiles} deleted)`,
      `File types: ${[...new Set(fileTypes)].join(', ')}`,
      `Code elements: ${uniqueChunkTypes.join(', ')}`,
      `Total chunks: ${chunks.length}`,
    ];

    // Add key file names
    const keyFiles = changedFiles.slice(0, 10).map((f) => `- ${f.path} (${f.status})`);
    if (keyFiles.length > 0) {
      summary.push('\nKey files:');
      summary.push(...keyFiles);
    }

    // Add function/class names from chunks
    const keyChunks = chunks
      .filter((c) => c.type === 'function' || c.type === 'class')
      .slice(0, 10)
      .map((c) => `- ${c.name} (${c.type}) in ${c.file}`);
    if (keyChunks.length > 0) {
      summary.push('\nKey code elements:');
      summary.push(...keyChunks);
    }

    return summary.join('\n');
  }

  /**
   * Create prompt for AI to suggest PR title
   */
  private createTitlePrompt(currentTitle: string | undefined, changeSummary: string): string {
    return `Analyze the following PR changes and suggest a clear, descriptive PR title.

Current PR title: ${currentTitle || '(not provided)'}

PR Changes Summary:
${changeSummary}

Requirements for the suggested title:
1. Follow conventional commit format (e.g., "feat: add user authentication", "fix: resolve memory leak in cache")
2. Be concise but descriptive (50-72 characters ideal)
3. Use imperative mood ("add" not "added", "fix" not "fixed")
4. Focus on the main change or feature
5. Include scope if relevant (e.g., "feat(api): add rate limiting")

Provide a suggested title and 2-3 alternative titles.`;
  }

  /**
   * Extract title from AI response
   */
  private extractTitleFromResponse(
    aiSummary: string,
    _currentTitle: string | undefined,
    changeSummary: string
  ): string | null {
    // Try to find title in AI summary
    // Look for patterns like "Suggested title:" or "Title:" or lines that look like titles
    const titlePatterns = [
      /(?:suggested|recommended|proposed)\s+title[:\s]+(.+)/i,
      /title[:\s]+(.+)/i,
      /^([a-z]+(?:\([^)]+\))?:\s+.+)$/im, // Conventional commit format
    ];

    for (const pattern of titlePatterns) {
      const match = aiSummary.match(pattern);
      if (match && match[1]) {
        const title = match[1]?.trim().split('\n')[0]?.trim();
        if (title && title.length > 0 && title.length < 200) {
          return title;
        }
      }
    }

    // Fallback: generate from change summary
    return this.generateTitleFromSummary(changeSummary);
  }

  /**
   * Generate title from change summary (fallback)
   */
  private generateTitleFromSummary(changeSummary: string): string | null {
    // Simple heuristic-based title generation
    const lines = changeSummary.split('\n');
    const firstLine = lines[0] || '';

    // Try to infer type from summary
    let type = 'chore';
    if (firstLine.toLowerCase().includes('fix') || firstLine.toLowerCase().includes('bug')) {
      type = 'fix';
    } else if (
      firstLine.toLowerCase().includes('feat') ||
      firstLine.toLowerCase().includes('add')
    ) {
      type = 'feat';
    } else if (firstLine.toLowerCase().includes('refactor')) {
      type = 'refactor';
    } else if (firstLine.toLowerCase().includes('test')) {
      type = 'test';
    } else if (firstLine.toLowerCase().includes('docs')) {
      type = 'docs';
    }

    // Extract key information
    const fileMatch = changeSummary.match(/Key files:\s*\n- (.+)/);
    const keyFile = fileMatch && fileMatch[1] ? fileMatch[1].split(' ')[0] : 'code';

    return `${type}: update ${keyFile}`;
  }

  /**
   * Generate alternative titles
   */
  private generateAlternatives(suggestedTitle: string, changeSummary: string): string[] {
    const alternatives: string[] = [];

    // Try variations
    const parts = suggestedTitle.split(':');
    if (parts.length === 2) {
      const [type, description] = parts;
      if (!type || !description) {
        return alternatives;
      }
      const trimmedDesc = description.trim();

      // Variation 1: Add scope if not present
      if (!type.includes('(')) {
        const scopeMatch = changeSummary.match(/File types: ([^,]+)/);
        if (scopeMatch && scopeMatch[1]) {
          const scope = scopeMatch[1].trim().toLowerCase();
          alternatives.push(`${type}(${scope}): ${trimmedDesc}`);
        }
      }

      // Variation 2: Shorter version
      const words = trimmedDesc.split(' ');
      if (words.length > 5) {
        alternatives.push(`${type}: ${words.slice(0, 5).join(' ')}`);
      }
    }

    return alternatives.slice(0, 3);
  }

  /**
   * Generate reason for suggestion
   */
  private generateReason(
    currentTitle: string | undefined,
    _suggestedTitle: string,
    changeSummary: string
  ): string {
    if (!currentTitle) {
      return 'A descriptive title helps reviewers understand the changes at a glance.';
    }

    const reasons: string[] = [];

    // Check if current title follows conventional commit format
    if (!/^[a-z]+(?:\([^)]+\))?:\s+.+/.test(currentTitle)) {
      reasons.push('Does not follow conventional commit format');
    }

    // Check length
    if (currentTitle.length > 72) {
      reasons.push('Title is too long (should be under 72 characters)');
    }

    // Check if it's too generic
    const genericTitles = ['update', 'fix', 'changes', 'wip', 'work in progress'];
    if (
      genericTitles.some((g) => currentTitle.toLowerCase().includes(g) && currentTitle.length < 20)
    ) {
      reasons.push('Title is too generic and does not describe the specific changes');
    }

    // Check imperative mood
    if (/^(added|fixed|updated|changed|removed)/i.test(currentTitle)) {
      reasons.push('Should use imperative mood (e.g., "add" not "added")');
    }

    if (reasons.length === 0) {
      return `The suggested title better reflects the scope and nature of the changes: ${changeSummary.split('\n')[0]}`;
    }

    return reasons.join('; ') + '.';
  }
}
