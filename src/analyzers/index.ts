/**
 * Analyzers Module
 *
 * Specialized code analyzers for security and performance
 */

export {
  SecurityAnalyzer,
  createSecurityAnalyzer,
  type SecurityIssue,
  type SecurityIssueType,
  type SecurityAnalysisResult,
  type SecurityAnalyzerOptions,
  type SecurityPattern,
} from './security-analyzer';

export {
  PerformanceAnalyzer,
  createPerformanceAnalyzer,
  type PerformanceIssue,
  type PerformanceIssueType,
  type PerformanceAnalysisResult,
  type PerformanceAnalyzerOptions,
  type PerformancePattern,
} from './performance-analyzer';

export {
  LinterIntegration,
  createLinterIntegration,
  type LinterTool,
  type LinterIssue,
  type LinterResult,
  type LinterConfig,
} from './linter-integration';

export {
  SASTIntegration,
  createSASTIntegration,
  type SASTTool,
  type SASTIssue,
  type SASTResult,
  type SASTConfig,
} from './sast-integration';

export {
  ToolChecker,
  type ToolAvailability,
  type ToolCheckResult,
} from './tool-checker';

export {
  CodegraphAnalyzer,
  createCodegraphAnalyzer,
  type DependencyNode,
  type DependencyGraph,
  type ImpactAnalysis,
  type CodegraphOptions,
} from './codegraph-analyzer';

export {
  FalsePositiveFilter,
  createFalsePositiveFilter,
  type FalsePositivePattern,
  type FilterStats,
  type FalsePositiveFilterOptions,
} from './false-positive-filter';
