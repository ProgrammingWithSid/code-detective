/**
 * Summary Types for PR Walkthrough & Summary Generation
 */

// ============================================================================
// Change Category Types
// ============================================================================

export type ChangeCategory =
  | 'feature'
  | 'bugfix'
  | 'refactor'
  | 'test'
  | 'docs'
  | 'style'
  | 'config'
  | 'dependency'
  | 'other';

export const CATEGORY_EMOJI: Record<ChangeCategory, string> = {
  feature: '✨',
  bugfix: '🐛',
  refactor: '♻️',
  test: '🧪',
  docs: '📚',
  style: '💄',
  config: '⚙️',
  dependency: '📦',
  other: '📝',
};

export const CATEGORY_LABELS: Record<ChangeCategory, string> = {
  feature: 'New Features',
  bugfix: 'Bug Fixes',
  refactor: 'Code Refactoring',
  test: 'Tests',
  docs: 'Documentation',
  style: 'Styling',
  config: 'Configuration',
  dependency: 'Dependencies',
  other: 'Other Changes',
};

// ============================================================================
// Risk Assessment Types
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  level: RiskLevel;
  score: number; // 0-100
  factors: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  description: string;
  weight: number;
  detected: boolean;
}

export const RISK_FACTORS: RiskFactor[] = [
  {
    name: 'large_change',
    description: 'Large number of lines changed (>500)',
    weight: 15,
    detected: false,
  },
  {
    name: 'many_files',
    description: 'Many files modified (>10)',
    weight: 10,
    detected: false,
  },
  {
    name: 'security_sensitive',
    description: 'Changes to security-sensitive files',
    weight: 25,
    detected: false,
  },
  {
    name: 'database_changes',
    description: 'Database schema or migration changes',
    weight: 20,
    detected: false,
  },
  {
    name: 'api_changes',
    description: 'Public API modifications',
    weight: 15,
    detected: false,
  },
  {
    name: 'config_changes',
    description: 'Configuration file modifications',
    weight: 10,
    detected: false,
  },
  {
    name: 'no_tests',
    description: 'No test files included',
    weight: 15,
    detected: false,
  },
];

// ============================================================================
// File Group Types
// ============================================================================

export interface FileGroup {
  category: ChangeCategory;
  files: FileChange[];
  summary: string;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  language: string;
}

// ============================================================================
// PR Summary Types
// ============================================================================

export interface PRSummary {
  /** One-line title */
  title: string;
  /** Brief overview paragraph */
  overview: string;
  /** Changes grouped by category */
  changeGroups: FileGroup[];
  /** Statistics */
  stats: PRStats;
  /** Risk assessment */
  risk: RiskAssessment;
  /** AI-generated insights */
  insights: string[];
  /** Recommendation */
  recommendation: SummaryRecommendation;
}

export interface PRStats {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
}

export type SummaryRecommendation = 'approve' | 'review_carefully' | 'request_changes' | 'block';

// ============================================================================
// Walkthrough Types
// ============================================================================

export interface PRWalkthrough {
  /** Title of the walkthrough */
  title: string;
  /** Overview section */
  overview: WalkthroughSection;
  /** Detailed sections by category */
  sections: WalkthroughSection[];
  /** Sequence diagram (mermaid) */
  sequenceDiagram?: string;
  /** File tree diagram */
  fileTreeDiagram?: string;
  /** Dependency graph (mermaid) */
  dependencyDiagram?: string;
}

export interface WalkthroughSection {
  title: string;
  emoji: string;
  content: string;
  files?: string[];
  collapsed?: boolean;
}

// ============================================================================
// Summary Options
// ============================================================================

export interface SummaryOptions {
  /** Include mermaid diagrams */
  includeDiagrams?: boolean;
  /** Include risk assessment */
  includeRisk?: boolean;
  /** Include AI insights */
  includeInsights?: boolean;
  /** Format: brief or detailed */
  format?: 'brief' | 'detailed';
  /** Max files to show per category */
  maxFilesPerCategory?: number;
  /** Generate collapsible sections */
  collapsible?: boolean;
}

export const DEFAULT_SUMMARY_OPTIONS: SummaryOptions = {
  includeDiagrams: true,
  includeRisk: true,
  includeInsights: true,
  format: 'detailed',
  maxFilesPerCategory: 10,
  collapsible: true,
};

// ============================================================================
// Diagram Types
// ============================================================================

export type DiagramType = 'sequence' | 'flowchart' | 'fileTree' | 'dependency';

export interface DiagramOptions {
  type: DiagramType;
  title?: string;
  maxNodes?: number;
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
}
