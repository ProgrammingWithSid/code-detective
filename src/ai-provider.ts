import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  AICategory,
  AIIssue,
  AIProviderError,
  AIReviewResponse,
  CodeChunk,
  Config,
  FileLanguageMap,
  isAIReviewResponse,
  ReviewComment,
  ReviewResult,
  Severity,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const LANGUAGE_MAP: FileLanguageMap = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  css: 'css',
  scss: 'scss',
  html: 'html',
  json: 'json',
};

const AI_CATEGORIES: readonly AICategory[] = [
  'bugs',
  'security',
  'performance',
  'code_quality',
  'architecture',
] as const;

const SYSTEM_PROMPT = `You are an Expert Senior Software Engineer & Code Reviewer.

Your job is to analyze provided code and return a fully structured PR review.

You MUST return ONLY valid JSON. No markdown. No explanations outside JSON.

---

## JSON OUTPUT SCHEMA (MANDATORY)

Your final answer MUST be a JSON object matching exactly this shape:

{
  "bugs": [
    {
      "severity": "Critical | High | Medium | Low | Nitpick",
      "file": "path/to/file",
      "line": 0,
      "description": "string",
      "fix": "string"
    }
  ],
  "security": [... same structure ...],
  "performance": [... same structure ...],
  "code_quality": [... same structure ...],
  "architecture": [... same structure ...],
  "summary": {
    "recommendation": "BLOCK | REQUEST_CHANGES | APPROVE_WITH_NITS | APPROVE",
    "top_issues": ["string", "string"]
  }
}

If a category has no issues, return an empty array.

---

## Categories You MUST Detect

Bugs:
- Logic errors
- Runtime issues
- Incorrect async/state handling
- Edge cases

Security:
- Injection vulnerabilities
- Hardcoded secrets
- Unsafe eval/new Function
- Authentication flaws
- Unsafe API usage

Performance:
- N+1 queries
- Inefficient loops
- Heavy operations repeated
- Unnecessary re-renders
- Blocking I/O

Code Quality:
- Anti-patterns
- Code smells
- Missing null checks
- Poor naming
- Duplicated logic

Architecture:
- Tight coupling
- Missing validation
- Weak contracts
- Bad error-handling
- Leaky abstractions

Memory Leaks:
- Memory leaks

---

## Rules

- Do NOT hallucinate file names or line numbers — only use what's provided.
- Do NOT output anything except valid JSON.
- Do NOT wrap JSON in backticks or markdown.
- Every issue MUST include: severity, file, line, description, fix.
- Be thorough and accurate.`;

// ============================================================================
// Interfaces
// ============================================================================

export interface AIProviderInterface {
  reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult>;
}

// ============================================================================
// Base Provider (Abstract)
// ============================================================================

abstract class BaseAIProvider implements AIProviderInterface {
  protected model: string;

  constructor(model: string) {
    this.model = model;
  }

  abstract reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult>;

  protected buildPrompt(chunks: CodeChunk[], globalRules: string[]): string {
    let prompt = '# Code Review Request\n\n';

    if (globalRules.length > 0) {
      prompt += '## Additional Rules to Check\n\n';
      globalRules.forEach((rule, index) => {
        prompt += `${index + 1}. ${rule}\n`;
      });
      prompt += '\n';
    }

    prompt += '## Code Chunks to Review\n\n';
    chunks.forEach((chunk, index) => {
      prompt += `### Chunk ${index + 1}: ${chunk.name} (${chunk.type})\n`;
      prompt += `**File:** ${chunk.file}\n`;
      prompt += `**Lines:** ${chunk.startLine}-${chunk.endLine}\n`;
      if (chunk.dependencies && chunk.dependencies.length > 0) {
        prompt += `**Dependencies:** ${chunk.dependencies.join(', ')}\n`;
      }
      const lang = this.getLanguageFromFile(chunk.file);
      prompt += `\n\`\`\`${lang}\n${chunk.content}\n\`\`\`\n\n`;
    });

    prompt +=
      '\n**IMPORTANT**: Only report issues on the lines shown above. Do not hallucinate file names or line numbers.\n';

    return prompt;
  }

  protected getLanguageFromFile(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    return LANGUAGE_MAP[ext] ?? (ext || 'text');
  }

  protected mapSeverity(severity: string): Severity {
    const normalized = severity?.toLowerCase() ?? '';
    if (normalized === 'critical' || normalized === 'high') return 'error';
    if (normalized === 'medium') return 'warning';
    if (normalized === 'low') return 'suggestion';
    if (normalized === 'nitpick') return 'info';
    return 'info';
  }

  protected parseResponse(content: string, chunks: CodeChunk[]): ReviewResult {
    try {
      const jsonStr = this.extractJSON(content);
      const parsed: unknown = JSON.parse(jsonStr);

      if (!isAIReviewResponse(parsed)) {
        return this.createFallbackResult(content, chunks);
      }

      const comments = this.extractComments(parsed);
      const summary = this.buildSummary(parsed);
      const stats = this.calculateStats(comments);

      return { comments, summary, stats };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Raw content:', content);
      return this.createFallbackResult(content, chunks);
    }
  }

  private extractJSON(content: string): string {
    let jsonStr = content.trim();
    const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (jsonMatch?.[1]) {
      jsonStr = jsonMatch[1].trim();
    }
    return jsonStr;
  }

  private extractComments(parsed: AIReviewResponse): ReviewComment[] {
    const comments: ReviewComment[] = [];

    for (const category of AI_CATEGORIES) {
      const issues: AIIssue[] = parsed[category] ?? [];
      for (const issue of issues) {
        if (!this.isValidIssue(issue)) continue;

        let body = issue.description;
        if (issue.fix) {
          body += `\n\n**Suggested Fix:** ${issue.fix}`;
        }

        comments.push({
          file: issue.file,
          line: issue.line,
          body,
          severity: this.mapSeverity(issue.severity),
          rule: category.replace('_', ' '),
        });
      }
    }

    return comments;
  }

  private isValidIssue(issue: AIIssue): boolean {
    return (
      typeof issue.file === 'string' &&
      typeof issue.line === 'number' &&
      typeof issue.description === 'string'
    );
  }

  private buildSummary(parsed: AIReviewResponse): string {
    if (parsed.summary) {
      let summary = `**Recommendation:** ${parsed.summary.recommendation ?? 'N/A'}`;
      if (parsed.summary.top_issues && parsed.summary.top_issues.length > 0) {
        summary += `\n\n**Top Issues:**\n${parsed.summary.top_issues.map((i) => `- ${i}`).join('\n')}`;
      }
      return summary;
    }
    return 'Review completed';
  }

  private calculateStats(comments: ReviewComment[]): ReviewResult['stats'] {
    return {
      errors: comments.filter((c) => c.severity === 'error').length,
      warnings: comments.filter((c) => c.severity === 'warning').length,
      suggestions: comments.filter((c) => c.severity === 'suggestion' || c.severity === 'info')
        .length,
    };
  }

  private createFallbackResult(content: string, chunks: CodeChunk[]): ReviewResult {
    return {
      comments: [
        {
          file: chunks[0]?.file ?? 'unknown',
          line: chunks[0]?.startLine ?? 1,
          body: content,
          severity: 'info',
        },
      ],
      summary: 'Review completed (parsing failed, showing raw response)',
      stats: {
        errors: 0,
        warnings: 0,
        suggestions: 1,
      },
    };
  }
}

// ============================================================================
// OpenAI Provider
// ============================================================================

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(apiKey: string, model: string) {
    super(model);
    this.client = new OpenAI({ apiKey });
  }

  async reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult> {
    const prompt = this.buildPrompt(chunks, globalRules);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      });

      const content = response.choices[0]?.message?.content ?? '';
      return this.parseResponse(content, chunks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AIProviderError(
        `OpenAI API call failed: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

// ============================================================================
// Claude Provider
// ============================================================================

export class ClaudeProvider extends BaseAIProvider {
  private client: Anthropic;

  constructor(apiKey: string, model: string) {
    super(model);
    this.client = new Anthropic({ apiKey });
  }

  async reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult> {
    const prompt = this.buildPrompt(chunks, globalRules);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const firstContent = response.content[0];
      const content = firstContent?.type === 'text' ? firstContent.text : '';
      return this.parseResponse(content, chunks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AIProviderError(
        `Claude API call failed: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export class AIProviderFactory {
  static create(config: Config): AIProviderInterface {
    switch (config.aiProvider) {
      case 'openai':
        if (!config.openai?.apiKey) {
          throw new AIProviderError('OpenAI API key is required');
        }
        return new OpenAIProvider(config.openai.apiKey, config.openai.model);

      case 'claude':
        if (!config.claude?.apiKey) {
          throw new AIProviderError('Claude API key is required');
        }
        return new ClaudeProvider(config.claude.apiKey, config.claude.model);

      default: {
        const provider: never = config.aiProvider;
        throw new AIProviderError(`Unsupported AI provider: ${String(provider)}`);
      }
    }
  }
}
