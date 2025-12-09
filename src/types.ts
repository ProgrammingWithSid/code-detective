import { z } from 'zod';

// ============================================================================
// AI Provider Types
// ============================================================================

export const AIProviderSchema = z.enum(['openai', 'claude']);
export type AIProvider = z.infer<typeof AIProviderSchema>;

// ============================================================================
// Configuration Types
// ============================================================================

export const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1, 'OpenAI API key is required'),
  model: z.string().default('gpt-4-turbo-preview'),
});
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

export const ClaudeConfigSchema = z.object({
  apiKey: z.string().min(1, 'Claude API key is required'),
  model: z.string().default('claude-3-5-sonnet-20241022'),
});
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;

export const RepositoryConfigSchema = z.object({
  owner: z.string().min(1, 'Repository owner is required'),
  repo: z.string().min(1, 'Repository name is required'),
  baseBranch: z.string().default('main'),
});
export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>;

export const PRConfigSchema = z.object({
  number: z.number(),
  baseBranch: z.string().optional(),
});
export type PRConfig = z.infer<typeof PRConfigSchema>;

export const GitHubConfigSchema = z.object({
  token: z.string().min(1, 'GitHub token is required'),
});
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

export const GitLabConfigSchema = z.object({
  token: z.string().min(1, 'GitLab token is required'),
  projectId: z.string().min(1, 'GitLab project ID is required'),
});
export type GitLabConfig = z.infer<typeof GitLabConfigSchema>;

export const ConfigSchema = z.object({
  aiProvider: AIProviderSchema,
  openai: OpenAIConfigSchema.optional(),
  claude: ClaudeConfigSchema.optional(),
  globalRules: z.array(z.string()).default([]),
  repository: RepositoryConfigSchema,
  pr: PRConfigSchema,
  github: GitHubConfigSchema.optional(),
  gitlab: GitLabConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Code Chunk Types
// ============================================================================

export interface CodeChunk {
  id: string;
  name: string;
  type: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  hash?: string;
  dependencies?: string[];
}

// Chunkyyy library response type - uses unknown for flexible mapping
export interface ChunkyyyChunk {
  id?: string;
  name?: string;
  type?: string;
  startLine?: number;
  endLine?: number;
  hash?: string;
  dependencies?: unknown[];
  range?: {
    start?: { line?: number };
    end?: { line?: number };
  };
}

// ============================================================================
// Review Types
// ============================================================================

export type Severity = 'error' | 'warning' | 'info' | 'suggestion';

export interface ReviewComment {
  file: string;
  line: number;
  body: string;
  severity: Severity;
  rule?: string;
}

export interface ReviewStats {
  errors: number;
  warnings: number;
  suggestions: number;
}

export interface ReviewResult {
  comments: ReviewComment[];
  summary: string;
  stats: ReviewStats;
}

// ============================================================================
// AI Response Types (from AI providers)
// ============================================================================

export type AISeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Nitpick';

export interface AIIssue {
  severity: AISeverity;
  file: string;
  line: number;
  description: string;
  fix?: string;
}

export type AICategory = 'bugs' | 'security' | 'performance' | 'code_quality' | 'architecture';

export interface AISummary {
  recommendation: 'BLOCK' | 'REQUEST_CHANGES' | 'APPROVE_WITH_NITS' | 'APPROVE';
  top_issues: string[];
}

export interface AIReviewResponse {
  bugs: AIIssue[];
  security: AIIssue[];
  performance: AIIssue[];
  code_quality: AIIssue[];
  architecture: AIIssue[];
  summary?: AISummary;
}

// ============================================================================
// Git Types
// ============================================================================

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface ChangedFile {
  path: string;
  status: FileStatus;
  additions?: number;
  deletions?: number;
  changedLines?: Set<number>;
}

export interface DiffHunk {
  startLine: number;
  lineCount: number;
}

// ============================================================================
// GitLab API Types
// ============================================================================

export interface GitLabMergeRequestDiffRefs {
  base_sha: string;
  start_sha: string;
  head_sha: string;
}

export interface GitLabMergeRequest {
  diff_refs: GitLabMergeRequestDiffRefs;
}

// ============================================================================
// Error Types
// ============================================================================

export class CodeSherlockError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CodeSherlockError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends CodeSherlockError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigurationError';
  }
}

export class GitError extends CodeSherlockError {
  constructor(message: string, cause?: Error) {
    super(message, 'GIT_ERROR', cause);
    this.name = 'GitError';
  }
}

export class AIProviderError extends CodeSherlockError {
  constructor(message: string, cause?: Error) {
    super(message, 'AI_PROVIDER_ERROR', cause);
    this.name = 'AIProviderError';
  }
}

export class PRCommentError extends CodeSherlockError {
  constructor(message: string, cause?: Error) {
    super(message, 'PR_COMMENT_ERROR', cause);
    this.name = 'PRCommentError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface FileLanguageMap {
  [extension: string]: string;
}

// Type guard functions
export function isAIReviewResponse(obj: unknown): obj is AIReviewResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const response = obj as Record<string, unknown>;
  return (
    Array.isArray(response.bugs) ||
    Array.isArray(response.security) ||
    Array.isArray(response.performance) ||
    Array.isArray(response.code_quality) ||
    Array.isArray(response.architecture)
  );
}

export function isAIIssue(obj: unknown): obj is AIIssue {
  if (typeof obj !== 'object' || obj === null) return false;
  const issue = obj as Record<string, unknown>;
  return (
    typeof issue.severity === 'string' &&
    typeof issue.file === 'string' &&
    typeof issue.line === 'number' &&
    typeof issue.description === 'string'
  );
}

// Default config values for CLI init command
export interface DefaultConfig {
  aiProvider: AIProvider;
  openai: OpenAIConfig;
  claude: ClaudeConfig;
  globalRules: string[];
  repository: {
    owner: string;
    repo: string;
    baseBranch: string;
  };
  pr: {
    number: number;
  };
  github: {
    token: string;
  };
}
