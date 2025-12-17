/**
 * Type Exports for Code Sherlock
 */

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

export const ReviewCacheConfigSchema = z.object({
  ttl: z.number().optional(), // Time to live in milliseconds
  maxSize: z.number().optional(), // Maximum cache size
});

export const BatchingConfigSchema = z.object({
  maxTokens: z.number().optional(), // Maximum tokens per batch
  maxChunks: z.number().optional(), // Maximum chunks per batch
  groupByFile: z.boolean().optional(), // Group chunks by file
});

export const ParallelConfigSchema = z.object({
  concurrency: z.number().optional(), // Maximum concurrent batches
  timeout: z.number().optional(), // Timeout per batch in milliseconds
});

export const IncrementalReviewConfigSchema = z.object({
  enabled: z.boolean().optional(), // Enable incremental reviews
  storagePath: z.string().optional(), // Path to store review state
  maxHistorySize: z.number().optional(), // Maximum number of reviewed chunks to track
});
export type IncrementalReviewConfig = z.infer<typeof IncrementalReviewConfigSchema>;

export const ConfigSchema = z.object({
  aiProvider: AIProviderSchema,
  openai: OpenAIConfigSchema.optional(),
  claude: ClaudeConfigSchema.optional(),
  globalRules: z.array(z.string()).default([]),
  repository: RepositoryConfigSchema,
  pr: PRConfigSchema,
  github: GitHubConfigSchema.optional(),
  gitlab: GitLabConfigSchema.optional(),
  reviewCache: ReviewCacheConfigSchema.optional(),
  batching: BatchingConfigSchema.optional(),
  parallel: ParallelConfigSchema.optional(),
  incrementalReview: IncrementalReviewConfigSchema.optional(),
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
  category?: string;
  fix?: string;
}

export interface ReviewStats {
  errors: number;
  warnings: number;
  suggestions: number;
}

export interface ReviewMetadata {
  reviewedAt: string;
  target: string;
  baseBranch: string;
  duration?: number;
  aiProvider?: string;
  model?: string;
}

export interface ReviewResultJSON {
  metadata: ReviewMetadata;
  summary: {
    recommendation: string;
    totalIssues: number;
    errors: number;
    warnings: number;
    suggestions: number;
    topIssues: string[];
    description: string;
  };
  comments: Array<{
    file: string;
    line: number;
    severity: Severity;
    category: string;
    message: string;
    fix: string | null;
  }>;
  namingSuggestions?: Array<{
    file: string;
    line: number;
    currentName: string;
    suggestedName: string;
    type: string;
    reason: string;
    severity: Severity;
  }>;
  prTitleSuggestion?: {
    currentTitle?: string;
    suggestedTitle: string;
    reason: string;
    alternatives?: string[];
  };
}

export interface ReviewQualityMetrics {
  accuracy: number;
  actionability: number;
  coverage: number;
  precision: number;
  recall: number;
  overallScore: number;
  confidence: number;
}

export interface NamingSuggestion {
  file: string;
  line: number;
  currentName: string;
  suggestedName: string;
  type: 'function' | 'variable' | 'class' | 'interface' | 'constant';
  reason: string;
  severity: Severity;
}

export interface PRTitleSuggestion {
  currentTitle?: string;
  suggestedTitle: string;
  reason: string;
  alternatives?: string[];
}

export interface ReviewResult {
  comments: ReviewComment[];
  summary: string;
  stats: ReviewStats;
  recommendation?: string;
  topIssues?: string[];
  metadata?: ReviewMetadata;
  qualityMetrics?: ReviewQualityMetrics;
  namingSuggestions?: NamingSuggestion[];
  prTitleSuggestion?: PRTitleSuggestion;
}

// ============================================================================
// AI Response Types
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

// Type guards
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

// Default config
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

// ============================================================================
// Re-export Command, Webhook, Summary, and AutoFix types
// ============================================================================

export * from './autofix';
export * from './commands';
export * from './summary';
export * from './webhooks';
