// Main exports
export { PRReviewer } from './reviewer';
export { ConfigLoader } from './config';
export { GitService } from './git';
export { ChunkService } from './chunker';

// AI Provider exports
export {
  AIProviderFactory,
  AIProviderInterface,
  OpenAIProvider,
  ClaudeProvider,
} from './ai-provider';

// PR Comment exports
export {
  PRCommentService,
  PRCommentServiceFactory,
  GitHubCommentService,
  GitLabCommentService,
} from './pr-comments';

// Type exports
export type {
  // Config types
  Config,
  AIProvider,
  OpenAIConfig,
  ClaudeConfig,
  RepositoryConfig,
  PRConfig,
  GitHubConfig,
  GitLabConfig,

  // Code types
  CodeChunk,
  ChunkyyyChunk,

  // Review types
  Severity,
  ReviewComment,
  ReviewStats,
  ReviewResult,

  // AI types
  AISeverity,
  AIIssue,
  AICategory,
  AISummary,
  AIReviewResponse,

  // Git types
  FileStatus,
  ChangedFile,
  DiffHunk,

  // GitLab types
  GitLabMergeRequest,
  GitLabMergeRequestDiffRefs,

  // Utility types
  LineRange,
  FileLanguageMap,
  DefaultConfig,
} from './types';

// Error exports
export {
  CodeSherlockError,
  ConfigurationError,
  GitError,
  AIProviderError,
  PRCommentError,
} from './types';

// Schema exports (for validation)
export {
  ConfigSchema,
  AIProviderSchema,
  OpenAIConfigSchema,
  ClaudeConfigSchema,
  RepositoryConfigSchema,
  PRConfigSchema,
  GitHubConfigSchema,
  GitLabConfigSchema,
} from './types';

// Type guard exports
export { isAIReviewResponse, isAIIssue } from './types';
