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
  OllamaProvider,
  RECOMMENDED_MODELS,
  createOllamaProvider,
  isOllamaRunning,
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
  ChatHandler,
  CodeExplainer,
  CommandParser,
  TestGenerator,
  buildContextFromWebhook,
  createChatHandler,
  createCodeExplainer,
  createParser,
  createTestGenerator,
  extractCodeBlock,
  formatExplanationAsMarkdown,
  formatTestsAsMarkdown,
  hasSherlockCommand,
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
  DiagramGenerator,
  SummaryBuilder,
  createDiagramGenerator,
  createSummaryBuilder,
} from './feedback';

// Auto-Fix exports
export {
  AutoFix,
  FixApplier,
  FixGenerator,
  createAutoFix,
  createDefaultAutoFix,
  createFixApplier,
  createFixGenerator,
} from './autofix';
export type { AutoFixOptions } from './autofix';

// Analyzers exports
export {
  PerformanceAnalyzer,
  SecurityAnalyzer,
  createPerformanceAnalyzer,
  createSecurityAnalyzer,
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
export { CodegraphAnalyzer, createCodegraphAnalyzer } from './analyzers/codegraph-analyzer';
export type { CodegraphOptions, ImpactAnalysis } from './analyzers/codegraph-analyzer';

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
  CodeIndexer,
  CodeSuggestion,
  CommandContext,
  CommandHandler,
  CommandRegistry,
  CommandResponse,
  CommandType,
  // Config types
  Config,
  DefaultConfig,
  DependencyExtraction,
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
  GitLabMRWebhookPayload,
  GitLabMergeRequest,
  GitLabMergeRequestDiffRefs,
  GitLabNoteWebhookPayload,
  // Utility types
  LineRange,
  NormalizedWebhookEvent,
  OpenAIConfig,
  PRConfig,
  PRStats,
  PRSummary,
  PRWalkthrough,
  ParsedCommand,
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
  SymbolExtraction,
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
  DependencyExtractionSchema,
  GitHubConfigSchema,
  GitLabConfigSchema,
  OpenAIConfigSchema,
  PRConfigSchema,
  RepositoryConfigSchema,
  SymbolExtractionSchema,
} from './types';

// Type guard exports
export { isAIIssue, isAIReviewResponse } from './types';

// Command constants
export { COMMAND_HELP, COMMAND_PREFIX, CommandType as CommandTypes } from './types/commands';

// Indexer Client
export { IndexerClient, createIndexerClient } from './utils/indexer-client';
