/**
 * Ollama Provider - Local LLM Support
 *
 * Supports running AI code reviews with locally hosted models via Ollama.
 */

import { AIIssue, AIReviewResponse, AISeverity } from '../types';

export interface OllamaConfig {
  /** Ollama server URL */
  baseUrl?: string;
  /** Model name */
  model?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Temperature for generation */
  temperature?: number;
  /** Number of tokens to predict */
  numPredict?: number;
  /** Keep model loaded in memory */
  keepAlive?: string;
}

const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:11434',
  model: 'codellama',
  timeout: 120000,
  temperature: 0.3,
  numPredict: 4096,
  keepAlive: '5m',
};

const CODE_REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the provided code and identify issues.

For each issue found, provide a JSON response with this structure:
{
  "bugs": [{ "line": <number>, "severity": "error"|"warning"|"info", "file": "<filename>", "description": "<issue>", "fix": "<suggestion>" }],
  "security": [...],
  "performance": [...],
  "code_quality": [...],
  "architecture": [],
  "summary": { "recommendation": "APPROVE"|"REQUEST_CHANGES"|"BLOCK", "top_issues": ["issue1", "issue2"] }
}

Be concise and actionable. Only report genuine issues.`;

export class OllamaProvider {
  private config: typeof DEFAULT_CONFIG;

  constructor(config: OllamaConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Review code using Ollama
   */
  async reviewCode(code: string, filename: string, context?: string): Promise<AIReviewResponse> {
    const prompt = this.buildPrompt(code, filename, context);

    try {
      const response = await this.generate(prompt);
      return this.parseResponse(response, filename);
    } catch (error) {
      console.error('Ollama review failed:', error);
      return this.emptyResponse();
    }
  }

  /**
   * Generate completion from Ollama
   */
  private async generate(prompt: string): Promise<string> {
    const url = `${this.config.baseUrl}/api/generate`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: prompt,
          system: CODE_REVIEW_SYSTEM_PROMPT,
          stream: false,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.numPredict,
          },
          keep_alive: this.config.keepAlive,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = (await response.json()) as { response?: string };
      return data.response || '';
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Build the review prompt
   */
  private buildPrompt(code: string, filename: string, context?: string): string {
    let prompt = `Review this code file: ${filename}\n\n`;
    if (context) prompt += `Context: ${context}\n\n`;
    prompt += `\`\`\`\n${code}\n\`\`\`\n\nRespond with JSON only.`;
    return prompt;
  }

  /**
   * Parse Ollama response into structured format
   */
  private parseResponse(response: string, filename: string): AIReviewResponse {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.emptyResponse();
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<AIReviewResponse>;

      interface RawIssue {
        severity?: string;
        file?: string;
        line?: number;
        description?: string;
        message?: string;
        fix?: string;
        suggestion?: string;
      }

      const mapIssues = (issues: RawIssue[]): AIIssue[] =>
        (issues || []).map((issue: RawIssue) => ({
          severity: this.normalizeSeverity(String(issue.severity || 'info')),
          file: String(issue.file || filename),
          line: Number(issue.line || 1),
          description: String(issue.description || issue.message || 'Issue detected'),
          fix: issue.fix
            ? String(issue.fix)
            : issue.suggestion
              ? String(issue.suggestion)
              : undefined,
        })) as AIIssue[];

      return {
        bugs: mapIssues(parsed.bugs || []),
        security: mapIssues(parsed.security || []),
        performance: mapIssues(parsed.performance || []),
        code_quality: mapIssues(parsed.code_quality || []),
        architecture: mapIssues(parsed.architecture || []),
        summary: parsed.summary || {
          recommendation: 'APPROVE',
          top_issues: [],
        },
      };
    } catch {
      return this.emptyResponse();
    }
  }

  /**
   * Create empty response
   */
  private emptyResponse(): AIReviewResponse {
    return {
      bugs: [],
      security: [],
      performance: [],
      code_quality: [],
      architecture: [],
      summary: {
        recommendation: 'APPROVE',
        top_issues: [],
      },
    };
  }

  /**
   * Normalize severity string
   */
  private normalizeSeverity(severity: string): AISeverity {
    const s = severity.toLowerCase();
    if (s.includes('critical') || s.includes('error')) return 'Critical';
    if (s.includes('high')) return 'High';
    if (s.includes('medium') || s.includes('warning')) return 'Medium';
    if (s.includes('low')) return 'Low';
    return 'Nitpick';
  }

  /**
   * Check if Ollama server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      return (data.models || []).map((m) => m.name);
    } catch {
      return [];
    }
  }
}

/**
 * Factory function
 */
export function createOllamaProvider(config?: OllamaConfig): OllamaProvider {
  return new OllamaProvider(config);
}

/**
 * Check if Ollama is running
 */
export async function isOllamaRunning(baseUrl = 'http://localhost:11434'): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Recommended models for code review
 */
export const RECOMMENDED_MODELS = {
  codellama: 'Code Llama - optimized for code',
  'deepseek-coder': 'DeepSeek Coder - excellent for review',
  mistral: 'Mistral 7B - fast general purpose',
  llama2: 'Llama 2 - general purpose',
};
