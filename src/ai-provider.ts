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
import { ContextAwarePromptBuilder } from './utils/context-aware-prompt';

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

## Reasoning Process (Chain-of-Thought)
Before providing the final JSON, you MUST internalize the following:
1. **Analyze Context**: Understand what this code does and its role in the system.
2. **Trace Dependencies**: Consider how changes might affect call-sites or dependent modules.
3. **Identify Side Effects**: Look for hidden implications (e.g., race conditions, memory leaks, breaking API changes).
4. **Evaluate Severity**: Only report issues that truly matter. Avoid bikeshedding.

## JSON OUTPUT SCHEMA (MANDATORY)
Your final answer MUST be a JSON object matching exactly this shape:

{
  "reasoning": "A brief summary of your internal analysis and chain-of-thought",
  "bugs": [
    {
      "severity": "Critical | High | Medium | Low | Nitpick",
      "file": "path/to/file",
      "line": 0,
      "description": "string",
      "fix": "string",
      "impact_analysis": "Predicted side effects of this bug or its fix"
    }
  ],
  "security": [... same structure ...],
  "performance": [... same structure ...],
  "code_quality": [... same structure ...],
  "architecture": [... same structure ...],
  "summary": {
    "recommendation": "BLOCK | REQUEST_CHANGES | APPROVE_WITH_NITS | APPROVE",
    "top_issues": ["string", "string"],
    "complexity_score": 0-10,
    "critical_files": ["string"]
  }
}

If a category has no issues, return an empty array.

---

## Rules
- Do NOT hallucinate file names or line numbers.
- Do NOT output anything except valid JSON.
- Every issue MUST include: severity, file, line, description, fix.
- Focus on accuracy and actionable feedback.`;

// ============================================================================
// Interfaces
// ============================================================================

export interface AIProviderInterface {
  reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult>;
  deepDiveReview(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult>;
  scoutReview(chunks: CodeChunk[]): Promise<{ complexityScore: number; criticalFiles: string[] }>;
}

// ============================================================================
// Base Provider (Abstract)
// ============================================================================

abstract class BaseAIProvider implements AIProviderInterface {
  protected model: string;
  protected promptBuilder: ContextAwarePromptBuilder;
  protected useContextAwarePrompts: boolean;

  constructor(model: string, useContextAwarePrompts: boolean = true) {
    this.model = model;
    this.useContextAwarePrompts = useContextAwarePrompts;
    this.promptBuilder = new ContextAwarePromptBuilder();
  }

  abstract reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult>;

  async deepDiveReview(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult> {
    // For now, deep dive uses the same implementation but can be overridden
    // or use a more descriptive prompt prefix.
    const deepInstructions = [
      ...globalRules,
      'CRITICAL: Perform an exhaustive deep-dive analysis of this code.',
      'Trace all data flows and identify subtle race conditions or edge cases.',
    ];
    return this.reviewCode(chunks, deepInstructions);
  }

  async scoutReview(
    chunks: CodeChunk[]
  ): Promise<{ complexityScore: number; criticalFiles: string[] }> {
    const prompt = `Perform a high-level scout review of these code chunks.
Identify complexity hotspots and critical files that need deep-dive analysis.
Return ONLY JSON: { "complexityScore": 0-10, "criticalFiles": ["file1", "file2"] }

Chunks:
${chunks.map((c) => `- ${c.file} (${c.type}): ${c.name}`).join('\n')}`;

    try {
      const response = await this.callAI(prompt, 'You are a high-speed complexity analyzer.');
      const jsonStr = this.extractJSON(response);
      const parsed = JSON.parse(jsonStr) as {
        complexityScore: number;
        criticalFiles: string[];
      };
      return {
        complexityScore: parsed.complexityScore || 0,
        criticalFiles: parsed.criticalFiles || [],
      };
    } catch (error) {
      console.warn('Scout review failed, falling back to all files:', error);
      return {
        complexityScore: 5,
        criticalFiles: Array.from(new Set(chunks.map((c) => c.file))),
      };
    }
  }

  protected abstract callAI(prompt: string, systemPrompt?: string): Promise<string>;

  protected buildPrompt(chunks: CodeChunk[], globalRules: string[]): string {
    if (this.useContextAwarePrompts) {
      // Extract context from chunks
      const context = ContextAwarePromptBuilder.extractContext(chunks);

      // Build context-aware prompt
      return this.promptBuilder.buildPrompt(chunks, globalRules, context);
    }

    // Fallback to simple prompt
    return this.buildSimplePrompt(chunks, globalRules);
  }

  protected buildSimplePrompt(chunks: CodeChunk[], globalRules: string[]): string {
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

      // Include language and extension information from chunkyyy
      if (chunk.language) {
        prompt += `**Language:** ${chunk.language}\n`;
      }
      if (chunk.extension) {
        prompt += `**File Extension:** ${chunk.extension}\n`;
      }

      if (chunk.dependencies && chunk.dependencies.length > 0) {
        prompt += `**Dependencies:** ${chunk.dependencies.join(', ')}\n`;
      }

      // Use language from chunk if available, otherwise fallback to file-based detection
      const lang = chunk.language || this.getLanguageFromFile(chunk.file);
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
      const parsed = JSON.parse(jsonStr) as Partial<AIReviewResponse>;

      if (!isAIReviewResponse(parsed)) {
        return this.createFallbackResult(content, chunks);
      }

      const comments = this.extractComments(parsed);
      const { summary, recommendation, topIssues } = this.buildSummary(parsed);
      const stats = this.calculateStats(comments);

      return { comments, summary, stats, recommendation, topIssues };
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
          category: category,
          fix: issue.fix,
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

  private buildSummary(parsed: AIReviewResponse): {
    summary: string;
    recommendation: string;
    topIssues: string[];
  } {
    if (parsed.summary) {
      let summary = `**Recommendation:** ${parsed.summary.recommendation ?? 'N/A'}`;
      if (parsed.summary.top_issues && parsed.summary.top_issues.length > 0) {
        summary += `\n\n**Top Issues:**\n${parsed.summary.top_issues.map((i) => `- ${i}`).join('\n')}`;
      }
      return {
        summary,
        recommendation: parsed.summary.recommendation ?? 'N/A',
        topIssues: parsed.summary.top_issues ?? [],
      };
    }
    return {
      summary: 'Review completed',
      recommendation: 'N/A',
      topIssues: [],
    };
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
    const content = await this.callAI(prompt, SYSTEM_PROMPT);
    return this.parseResponse(content, chunks);
  }

  protected async callAI(prompt: string, systemPrompt: string = SYSTEM_PROMPT): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      });

      return response.choices[0]?.message?.content ?? '';
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
    const content = await this.callAI(prompt, SYSTEM_PROMPT);
    return this.parseResponse(content, chunks);
  }

  protected async callAI(prompt: string, systemPrompt: string = SYSTEM_PROMPT): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const firstContent = response.content[0];
      return firstContent?.type === 'text' ? firstContent.text : '';
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
// Ollama Provider
// ============================================================================

export class OllamaProvider extends BaseAIProvider {
  private baseUrl: string;

  constructor(model: string, baseUrl: string = 'http://localhost:11434') {
    super(model);
    this.baseUrl = baseUrl;
  }

  async reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult> {
    const prompt = this.buildPrompt(chunks, globalRules);
    const content = await this.callAI(prompt, SYSTEM_PROMPT);
    return this.parseResponse(content, chunks);
  }

  protected async callAI(prompt: string, systemPrompt: string = SYSTEM_PROMPT): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 4096,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = (await response.json()) as { response: string };
      return data.response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AIProviderError(`Ollama API call failed: ${errorMessage}`);
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

      case 'ollama':
        return new OllamaProvider(config.ollama?.model || 'codellama', config.ollama?.baseUrl);

      default: {
        const provider: never = config.aiProvider;
        throw new AIProviderError(`Unsupported AI provider: ${String(provider)}`);
      }
    }
  }
}
