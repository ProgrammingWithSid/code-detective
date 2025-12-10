// Main exports
export { ChunkService } from './chunker';
export { ConfigLoader } from './config';
export { GitService } from './git';
export { PRReviewer, reviewResultToJSON } from './reviewer';

// AI Provider exports
export {
  AIProviderFactory,
  AIProviderInterface,
  ClaudeProvider,
  OpenAIProvider,
} from './ai-provider';

// Ollama Provider exports (Local LLM)
export {
  createOllamaProvider,
  isOllamaRunning,
  OllamaProvider,
  RECOMMENDED_MODELS,
} from './ai-provider/ollama-provider';
export type { OllamaConfig } from './ai-provider/ollama-provider';

// PR Comment exports
export {
  GitHubCommentService,
  GitLabCommentService,
  PRCommentService,
  PRCommentServiceFactory,
} from './pr-comments';

// Conversation exports
export {
  buildContextFromWebhook,
  ChatHandler,
  CodeExplainer,
  CommandParser,
  createChatHandler,
  createCodeExplainer,
  createParser,
  createTestGenerator,
  extractCodeBlock,
  formatExplanationAsMarkdown,
  formatTestsAsMarkdown,
  hasSherlockCommand,
  TestGenerator,
} from './conversation';
export type {
  ChatHandlerOptions,
  CodeExplanation,
  ExplanationOptions,
  GeneratedTest,
  ParserOptions,
  TestGenerationOptions,
  TestGenerationResult,
} from './conversation';

// Feedback exports
export {
  createDiagramGenerator,
  createSummaryBuilder,
  DiagramGenerator,
  SummaryBuilder,
} from './feedback';

// Auto-Fix exports
export {
  AutoFix,
  createAutoFix,
  createDefaultAutoFix,
  createFixApplier,
  createFixGenerator,
  FixApplier,
  FixGenerator,
} from './autofix';
export type { AutoFixOptions } from './autofix';

// Analyzers exports
export {
  createPerformanceAnalyzer,
  createSecurityAnalyzer,
  PerformanceAnalyzer,
  SecurityAnalyzer,
} from './analyzers';
export type {
  PerformanceAnalysisResult,
  PerformanceAnalyzerOptions,
  PerformanceIssue,
  PerformanceIssueType,
  PerformancePattern,
  SecurityAnalysisResult,
  SecurityAnalyzerOptions,
  SecurityIssue,
  SecurityIssueType,
  SecurityPattern,
} from './analyzers';

// Type exports
export type {
  // AI types
  AICategory,
  AIIssue,
  AIProvider,
  AIReviewResponse,
  AISeverity,
  AISummary,
  // Summary types
  ChangeCategory,
  ChangedFile,
  ChunkyyyChunk,
  ClaudeConfig,
  // Code types
  CodeChunk,
  CodeSuggestion,
  CommandContext,
  CommandHandler,
  CommandRegistry,
  CommandResponse,
  CommandType,
  // Config types
  Config,
  DefaultConfig,
  DiagramOptions,
  DiagramType,
  DiffHunk,
  FileChange,
  FileGroup,
  FileLanguageMap,
  // Git types
  FileStatus,
  GitHubCommentWebhookPayload,
  GitHubConfig,
  GitHubPRWebhookPayload,
  GitLabConfig,
  GitLabMergeRequest,
  GitLabMergeRequestDiffRefs,
  GitLabMRWebhookPayload,
  GitLabNoteWebhookPayload,
  // Utility types
  LineRange,
  NormalizedWebhookEvent,
  OpenAIConfig,
  ParsedCommand,
  PRConfig,
  PRStats,
  PRSummary,
  PRWalkthrough,
  RepositoryConfig,
  ReviewComment,
  ReviewMetadata,
  ReviewResult,
  ReviewResultJSON,
  ReviewStats,
  RiskAssessment,
  RiskLevel,
  Severity,
  SummaryOptions,
  SummaryRecommendation,
  WalkthroughSection,
  WebhookHandler,
  WebhookPlatform,
} from './types';

// Error exports
export {
  AIProviderError,
  CodeSherlockError,
  ConfigurationError,
  GitError,
  PRCommentError,
} from './types';

// Schema exports (for validation)
export {
  AIProviderSchema,
  ClaudeConfigSchema,
  ConfigSchema,
  GitHubConfigSchema,
  GitLabConfigSchema,
  OpenAIConfigSchema,
  PRConfigSchema,
  RepositoryConfigSchema,
} from './types';

// Type guard exports
export { isAIIssue, isAIReviewResponse } from './types';

// Command constants
export { COMMAND_HELP, COMMAND_PREFIX, CommandType as CommandTypes } from './types/commands';
