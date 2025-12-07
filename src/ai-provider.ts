import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { CodeChunk, Config, ReviewComment, ReviewResult } from './types';

export interface AIProviderInterface {
  reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult>;
}

export class OpenAIProvider implements AIProviderInterface {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult> {
    const prompt = this.buildPrompt(chunks, globalRules);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert code reviewer. Analyze the provided code chunks and identify bugs, vulnerabilities, security issues, performance problems, and code quality issues. Provide specific, actionable feedback with file paths and line numbers.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '';
    return this.parseResponse(content, chunks);
  }

  private buildPrompt(chunks: CodeChunk[], globalRules: string[]): string {
    let prompt = '# Code Review Request\n\n';

    if (globalRules.length > 0) {
      prompt += '## Global Rules\n\n';
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
      prompt += `\n\`\`\`typescript\n${chunk.content}\n\`\`\`\n\n`;
    });

    prompt += '\n## Review Instructions\n\n';
    prompt += '**IMPORTANT**: Only provide comments on lines that were actually changed/added in this PR. ';
    prompt += 'Do not comment on unchanged code that was included in the chunks for context.\n\n';
    prompt += 'Please review the code chunks above and provide:\n';
    prompt += '1. A summary of findings\n';
    prompt += '2. Specific comments with:\n';
    prompt += '   - File path\n';
    prompt += '   - Line number (must be a line that was changed/added)\n';
    prompt += '   - Severity (error, warning, info, suggestion)\n';
    prompt += '   - Description of the issue\n';
    prompt += '   - Suggested fix (if applicable)\n';
    prompt += '\nFormat your response as JSON:\n';
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "summary": "Overall summary of findings",\n';
    prompt += '  "comments": [\n';
    prompt += '    {\n';
    prompt += '      "file": "path/to/file.ts",\n';
    prompt += '      "line": 42,\n';
    prompt += '      "severity": "error",\n';
    prompt += '      "body": "Description of the issue",\n';
    prompt += '      "rule": "Optional rule reference"\n';
    prompt += '    }\n';
    prompt += '  ]\n';
    prompt += '}\n';
    prompt += '```';

    return prompt;
  }

  private parseResponse(content: string, chunks: CodeChunk[]): ReviewResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr);
      const comments: ReviewComment[] = (parsed.comments || []).map((c: any) => ({
        file: c.file,
        line: c.line,
        body: c.body,
        severity: c.severity || 'info',
        rule: c.rule,
      }));

      const stats = {
        errors: comments.filter(c => c.severity === 'error').length,
        warnings: comments.filter(c => c.severity === 'warning').length,
        suggestions: comments.filter(c => c.severity === 'suggestion' || c.severity === 'info').length,
      };

      return {
        comments,
        summary: parsed.summary || 'Review completed',
        stats,
      };
    } catch (error) {
      // Fallback: create a single comment with the raw response
      return {
        comments: [{
          file: chunks[0]?.file || 'unknown',
          line: chunks[0]?.startLine || 1,
          body: content,
          severity: 'info',
        }],
        summary: 'Review completed (parsing failed, showing raw response)',
        stats: {
          errors: 0,
          warnings: 0,
          suggestions: 1,
        },
      };
    }
  }
}

export class ClaudeProvider implements AIProviderInterface {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async reviewCode(chunks: CodeChunk[], globalRules: string[]): Promise<ReviewResult> {
    const prompt = this.buildPrompt(chunks, globalRules);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    return this.parseResponse(content, chunks);
  }

  private buildPrompt(chunks: CodeChunk[], globalRules: string[]): string {
    let prompt = '# Code Review Request\n\n';

    if (globalRules.length > 0) {
      prompt += '## Global Rules\n\n';
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
      prompt += `\n\`\`\`typescript\n${chunk.content}\n\`\`\`\n\n`;
    });

    prompt += '\n## Review Instructions\n\n';
    prompt += '**IMPORTANT**: Only provide comments on lines that were actually changed/added in this PR. ';
    prompt += 'Do not comment on unchanged code that was included in the chunks for context.\n\n';
    prompt += 'Please review the code chunks above and provide:\n';
    prompt += '1. A summary of findings\n';
    prompt += '2. Specific comments with:\n';
    prompt += '   - File path\n';
    prompt += '   - Line number (must be a line that was changed/added)\n';
    prompt += '   - Severity (error, warning, info, suggestion)\n';
    prompt += '   - Description of the issue\n';
    prompt += '   - Suggested fix (if applicable)\n';
    prompt += '\nFormat your response as JSON:\n';
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "summary": "Overall summary of findings",\n';
    prompt += '  "comments": [\n';
    prompt += '    {\n';
    prompt += '      "file": "path/to/file.ts",\n';
    prompt += '      "line": 42,\n';
    prompt += '      "severity": "error",\n';
    prompt += '      "body": "Description of the issue",\n';
    prompt += '      "rule": "Optional rule reference"\n';
    prompt += '    }\n';
    prompt += '  ]\n';
    prompt += '}\n';
    prompt += '```';

    return prompt;
  }

  private parseResponse(content: string, chunks: CodeChunk[]): ReviewResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr);
      const comments: ReviewComment[] = (parsed.comments || []).map((c: any) => ({
        file: c.file,
        line: c.line,
        body: c.body,
        severity: c.severity || 'info',
        rule: c.rule,
      }));

      const stats = {
        errors: comments.filter(c => c.severity === 'error').length,
        warnings: comments.filter(c => c.severity === 'warning').length,
        suggestions: comments.filter(c => c.severity === 'suggestion' || c.severity === 'info').length,
      };

      return {
        comments,
        summary: parsed.summary || 'Review completed',
        stats,
      };
    } catch (error) {
      // Fallback: create a single comment with the raw response
      return {
        comments: [{
          file: chunks[0]?.file || 'unknown',
          line: chunks[0]?.startLine || 1,
          body: content,
          severity: 'info',
        }],
        summary: 'Review completed (parsing failed, showing raw response)',
        stats: {
          errors: 0,
          warnings: 0,
          suggestions: 1,
        },
      };
    }
  }
}

export class AIProviderFactory {
  static create(config: Config): AIProviderInterface {
    switch (config.aiProvider) {
      case 'openai':
        if (!config.openai?.apiKey) {
          throw new Error('OpenAI API key is required');
        }
        return new OpenAIProvider(config.openai.apiKey, config.openai.model);

      case 'claude':
        if (!config.claude?.apiKey) {
          throw new Error('Claude API key is required');
        }
        return new ClaudeProvider(config.claude.apiKey, config.claude.model);

      default:
        throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
    }
  }
}
