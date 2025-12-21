/**
 * Type Exports for Code Sherlock
 */

import { z } from 'zod';

// ============================================================================
// AI Provider Types
// ============================================================================

export const AIProviderSchema = z.enum(['openai', 'claude', 'ollama']);
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

export const OllamaConfigSchema = z.object({
  baseUrl: z.string().default('http://localhost:11434'),
  model: z.string().default('codellama'),
});
export type OllamaConfig = z.infer<typeof OllamaConfigSchema>;

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

export const LinterConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  tools: z
    .array(
      z.enum([
        // JavaScript/TypeScript
        'eslint',
        'prettier',
        'typescript',
        'tslint',
        'jshint',
        'standard',
        'xo',
        'biome',
        'deno-lint',
        // Python
        'pylint',
        'flake8',
        'black',
        'mypy',
        'isort',
        'pydocstyle',
        'pylama',
        // Ruby
        'rubocop',
        // Go
        'golangci-lint',
        'gofmt',
        'go-vet',
        'staticcheck',
        'ineffassign',
        // Rust
        'rust-clippy',
        'rustfmt',
        // Java
        'checkstyle',
        'pmd',
        'spotbugs',
        'error-prone',
        // General
        'shellcheck',
        'hadolint',
        'markdownlint',
        'yamllint',
        'jsonlint',
        'custom',
      ])
    )
    .optional()
    .default([]),
  customCommands: z.record(z.string()).optional(),
  ignorePatterns: z.array(z.string()).optional(),
  workingDir: z.string().optional(),
  eslint: z
    .object({
      configFile: z.string().optional(),
      extensions: z.array(z.string()).optional(),
    })
    .optional(),
  prettier: z
    .object({
      configFile: z.string().optional(),
      checkOnly: z.boolean().optional(),
    })
    .optional(),
  typescript: z
    .object({
      configFile: z.string().optional(),
      noEmit: z.boolean().optional(),
    })
    .optional(),
});
export type LinterConfig = z.infer<typeof LinterConfigSchema>;

export const SASTConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  tools: z
    .array(
      z.enum([
        'semgrep',
        'sonarqube',
        'bandit',
        'gosec',
        'brakeman',
        'npm-audit',
        'snyk',
        'trivy',
        'owasp-dependency-check',
        'safety',
        'pip-audit',
        'bundler-audit',
        'cargo-audit',
        'mix-audit',
        'custom',
      ])
    )
    .optional()
    .default([]),
  customCommands: z.record(z.string()).optional(),
  ignorePatterns: z.array(z.string()).optional(),
  workingDir: z.string().optional(),
  minSeverity: z.enum(['error', 'warning', 'info', 'suggestion']).optional(),
  semgrep: z
    .object({
      config: z.string().optional(),
      rules: z.array(z.string()).optional(),
      severity: z.array(z.string()).optional(),
    })
    .optional(),
  sonarqube: z
    .object({
      projectKey: z.string().optional(),
      serverUrl: z.string().optional(),
      token: z.string().optional(),
    })
    .optional(),
  bandit: z
    .object({
      configFile: z.string().optional(),
      severityLevel: z.number().optional(),
    })
    .optional(),
  gosec: z
    .object({
      severity: z.string().optional(),
      confidence: z.string().optional(),
    })
    .optional(),
  npmAudit: z
    .object({
      auditLevel: z.enum(['low', 'moderate', 'high', 'critical']).optional(),
    })
    .optional(),
  snyk: z
    .object({
      org: z.string().optional(),
      severityThreshold: z.string().optional(),
    })
    .optional(),
});
export type SASTConfig = z.infer<typeof SASTConfigSchema>;

export const ConfigSchema = z.object({
  aiProvider: AIProviderSchema,
  openai: OpenAIConfigSchema.optional(),
  claude: ClaudeConfigSchema.optional(),
  ollama: OllamaConfigSchema.optional(),
  globalRules: z.array(z.string()).default([]),
  repository: RepositoryConfigSchema,
  pr: PRConfigSchema,
  github: GitHubConfigSchema.optional(),
  gitlab: GitLabConfigSchema.optional(),
  reviewCache: ReviewCacheConfigSchema.optional(),
  batching: BatchingConfigSchema.optional(),
  parallel: ParallelConfigSchema.optional(),
  incrementalReview: IncrementalReviewConfigSchema.optional(),
  linter: LinterConfigSchema.optional(),
  sast: SASTConfigSchema.optional(),
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
  /** File extension (e.g., '.ts', '.py', '.vue') */
  extension?: string;
  /** Detected programming language (e.g., 'typescript', 'python', 'vue') */
  language?: string;
  /** Importance score based on impact analysis (0-100) */
  priorityScore?: number;
  /** Impact level (high, medium, low) */
  impactLevel?: 'high' | 'medium' | 'low';
}

export interface ChunkyyyChunk {
  id?: string;
  name?: string;
  type?: string;
  filePath?: string; // File path from chunkyyy chunk
  startLine?: number;
  endLine?: number;
  hash?: string;
  dependencies?: string[];
  range?: {
    start?: { line?: number };
    end?: { line?: number };
  };
}

// ============================================================================
// Indexer Types
// ============================================================================

export const SymbolExtractionSchema = z.object({
  name: z.string(),
  type: z.string(),
  signature: z.string(),
  start_line: z.number(),
  end_line: z.number(),
  is_exported: z.boolean(),
});

export const DependencyExtractionSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.enum(['import', 'require', 'export']),
});

export interface SymbolExtraction {
  name: string;
  type: string;
  signature: string;
  start_line: number;
  end_line: number;
  is_exported: boolean;
}

export interface DependencyExtraction {
  source: string;
  target: string;
  type: 'import' | 'require' | 'export';
}

/**
 * Interface for code indexing services (e.g., Rust-based indexer)
 */
export interface CodeIndexer {
  /** Check if the indexer service is available */
  isAvailable(): Promise<boolean>;
  /** Extract symbols from a file */
  extractSymbols(repoPath: string, filePath: string): Promise<SymbolExtraction[]>;
  /** Extract dependencies from a file */
  extractDeps(repoPath: string, filePath: string): Promise<DependencyExtraction[]>;
  /** Get hash for a file chunk */
  getHash(repoPath: string, filePath: string): Promise<string | null>;
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
  tool?: string; // Tool that generated this comment (e.g., 'eslint', 'prettier', 'semgrep')
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

export const AIIssueSchema = z.object({
  severity: z.enum(['Critical', 'High', 'Medium', 'Low', 'Nitpick']),
  file: z.string(),
  line: z.number(),
  description: z.string(),
  fix: z.string().optional(),
  impact_analysis: z.string().optional(),
});

export const AISummarySchema = z.object({
  recommendation: z.enum(['BLOCK', 'REQUEST_CHANGES', 'APPROVE_WITH_NITS', 'APPROVE']),
  top_issues: z.array(z.string()),
  complexity_score: z.number().optional(),
  critical_files: z.array(z.string()).optional(),
});

export const AIReviewResponseSchema = z
  .object({
    reasoning: z.string().optional(),
    bugs: z.array(AIIssueSchema).default([]),
    security: z.array(AIIssueSchema).default([]),
    performance: z.array(AIIssueSchema).default([]),
    code_quality: z.array(AIIssueSchema).default([]),
    architecture: z.array(AIIssueSchema).default([]),
    summary: AISummarySchema.optional(),
  })
  .partial();

export const AICategorySchema = z.enum([
  'bugs',
  'security',
  'performance',
  'code_quality',
  'architecture',
]);
export type AICategory = z.infer<typeof AICategorySchema>;

export interface AIReviewResponse extends z.infer<typeof AIReviewResponseSchema> {}
export type AISeverity = z.infer<typeof AIIssueSchema>['severity'];
export interface AIIssue extends z.infer<typeof AIIssueSchema> {}
export interface AISummary extends z.infer<typeof AISummarySchema> {}

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
export function isAIReviewResponse(obj: object | null): obj is AIReviewResponse {
  if (!obj) return false;
  return AIReviewResponseSchema.safeParse(obj).success;
}

export function isAIIssue(obj: object | null): obj is AIIssue {
  if (!obj) return false;
  return AIIssueSchema.safeParse(obj).success;
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
