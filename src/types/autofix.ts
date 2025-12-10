/**
 * Auto-Fix Types - Generate and apply code fixes automatically
 */

import { ReviewComment, Severity } from './index';

// ============================================================================
// Fix Types
// ============================================================================

export type FixType =
  | 'replace' // Replace code at location
  | 'insert' // Insert code at location
  | 'delete' // Delete code at location
  | 'wrap' // Wrap code with new code
  | 'refactor'; // Complex multi-location changes

export type FixConfidence = 'high' | 'medium' | 'low';

export interface CodeFix {
  /** Unique ID for this fix */
  id: string;
  /** Fix type */
  type: FixType;
  /** Description of the fix */
  description: string;
  /** File path */
  filePath: string;
  /** Start line (1-indexed) */
  startLine: number;
  /** End line (1-indexed, inclusive) */
  endLine: number;
  /** Original code */
  originalCode: string;
  /** Fixed code */
  fixedCode: string;
  /** Confidence in the fix */
  confidence: FixConfidence;
  /** Related issue category */
  category: string;
  /** Severity of the issue being fixed */
  severity: Severity;
  /** Alternative fixes if available */
  alternatives?: CodeFix[];
  /** Safety notes/warnings */
  safetyNotes?: string[];
  /** Is this fix safe to auto-apply? */
  isAutoApplicable: boolean;
  /** Dependencies that need to be added */
  dependenciesToAdd?: string[];
  /** Imports that need to be added */
  importsToAdd?: string[];
}

export interface FixSuggestion {
  /** The review comment this fix addresses */
  comment: ReviewComment;
  /** Proposed fix */
  fix: CodeFix;
  /** Explanation of why this fix works */
  explanation: string;
  /** Any potential side effects */
  sideEffects?: string[];
  /** Tests that might need updating */
  affectedTests?: string[];
}

// ============================================================================
// Fix Generation Types
// ============================================================================

export interface FixGeneratorOptions {
  /** AI model to use for fix generation */
  model?: 'openai' | 'claude';
  /** API key for the AI provider */
  apiKey?: string;
  /** Maximum fixes to generate per file */
  maxFixesPerFile?: number;
  /** Include alternative fixes */
  includeAlternatives?: boolean;
  /** Confidence threshold for fixes */
  minConfidence?: FixConfidence;
  /** Categories to generate fixes for */
  categories?: string[];
  /** Whether to validate fixes before returning */
  validateFixes?: boolean;
}

export const DEFAULT_FIX_OPTIONS: FixGeneratorOptions = {
  model: 'openai',
  maxFixesPerFile: 10,
  includeAlternatives: true,
  minConfidence: 'medium',
  validateFixes: true,
};

export interface FixGenerationContext {
  /** File path */
  filePath: string;
  /** Full file content */
  fileContent: string;
  /** Programming language */
  language: string;
  /** Review comments to fix */
  comments: ReviewComment[];
  /** Additional context (imports, dependencies, etc.) */
  additionalContext?: string;
}

export interface FixGenerationResult {
  /** Generated fix suggestions */
  suggestions: FixSuggestion[];
  /** Comments that couldn't be fixed */
  unfixable: Array<{
    comment: ReviewComment;
    reason: string;
  }>;
  /** Generation statistics */
  stats: FixGenerationStats;
}

export interface FixGenerationStats {
  /** Total comments processed */
  totalComments: number;
  /** Fixes generated */
  fixesGenerated: number;
  /** High confidence fixes */
  highConfidence: number;
  /** Medium confidence fixes */
  mediumConfidence: number;
  /** Low confidence fixes */
  lowConfidence: number;
  /** Comments that couldn't be fixed */
  unfixableCount: number;
  /** Time taken (ms) */
  generationTime: number;
}

// ============================================================================
// Fix Application Types
// ============================================================================

export interface FixApplicationOptions {
  /** Whether to create backup of original file */
  createBackup?: boolean;
  /** Backup directory */
  backupDir?: string;
  /** Only apply auto-applicable fixes */
  autoApplicableOnly?: boolean;
  /** Minimum confidence to apply */
  minConfidence?: FixConfidence;
  /** Dry run - don't actually apply fixes */
  dryRun?: boolean;
  /** Validate syntax after applying fixes */
  validateSyntax?: boolean;
}

export const DEFAULT_APPLICATION_OPTIONS: FixApplicationOptions = {
  createBackup: true,
  autoApplicableOnly: true,
  minConfidence: 'high',
  dryRun: false,
  validateSyntax: true,
};

export interface FixApplicationResult {
  /** Successfully applied fixes */
  applied: Array<{
    fix: CodeFix;
    filePath: string;
    backupPath?: string;
  }>;
  /** Fixes that failed to apply */
  failed: Array<{
    fix: CodeFix;
    reason: string;
  }>;
  /** Fixes that were skipped */
  skipped: Array<{
    fix: CodeFix;
    reason: string;
  }>;
  /** Total files modified */
  filesModified: number;
  /** Whether dry run was performed */
  isDryRun: boolean;
}

// ============================================================================
// Fix Validation Types
// ============================================================================

export interface FixValidation {
  /** Is the fix valid? */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Syntax check passed */
  syntaxValid?: boolean;
  /** Does the fix preserve semantics? */
  semanticsPreserved?: boolean;
}

export interface FixValidator {
  /** Validate a single fix */
  validate(fix: CodeFix, fileContent: string): Promise<FixValidation>;
  /** Validate multiple fixes */
  validateBatch(fixes: CodeFix[], fileContent: string): Promise<Map<string, FixValidation>>;
}

// ============================================================================
// Common Fix Patterns
// ============================================================================

export interface FixPattern {
  /** Pattern name */
  name: string;
  /** Pattern description */
  description: string;
  /** Categories this pattern applies to */
  categories: string[];
  /** Languages this pattern supports */
  languages: string[];
  /** Pattern to match */
  match: RegExp | string;
  /** Replacement template */
  replacement: string;
  /** Confidence level */
  confidence: FixConfidence;
  /** Is auto-applicable */
  autoApplicable: boolean;
}

export const COMMON_FIX_PATTERNS: FixPattern[] = [
  {
    name: 'add-null-check',
    description: 'Add null/undefined check before accessing property',
    categories: ['bug', 'safety'],
    languages: ['typescript', 'javascript'],
    match: /(\w+)\.(\w+)/,
    replacement: '$1?.$2',
    confidence: 'high',
    autoApplicable: true,
  },
  {
    name: 'use-const',
    description: 'Replace let with const for variables that are never reassigned',
    categories: ['style', 'best-practice'],
    languages: ['typescript', 'javascript'],
    match: /let\s+(\w+)\s*=/,
    replacement: 'const $1 =',
    confidence: 'high',
    autoApplicable: true,
  },
  {
    name: 'add-type-annotation',
    description: 'Add explicit type annotation',
    categories: ['typescript', 'type-safety'],
    languages: ['typescript'],
    match: /const\s+(\w+)\s*=\s*(.+)/,
    replacement: 'const $1: $TYPE = $2',
    confidence: 'medium',
    autoApplicable: false,
  },
  {
    name: 'use-template-literal',
    description: 'Replace string concatenation with template literal',
    categories: ['style', 'readability'],
    languages: ['typescript', 'javascript'],
    match: /(['"])(.+?)\1\s*\+\s*(\w+)\s*\+\s*(['"])(.+?)\4/,
    replacement: '`$2${$3}$5`',
    confidence: 'high',
    autoApplicable: true,
  },
  {
    name: 'async-await',
    description: 'Replace .then() chain with async/await',
    categories: ['style', 'readability'],
    languages: ['typescript', 'javascript'],
    match: /\.then\s*\(\s*(\w+)\s*=>/,
    replacement: 'await',
    confidence: 'medium',
    autoApplicable: false,
  },
  {
    name: 'remove-console-log',
    description: 'Remove console.log statements',
    categories: ['cleanup', 'production'],
    languages: ['typescript', 'javascript'],
    match: /console\.log\([^)]*\);?\n?/g,
    replacement: '',
    confidence: 'high',
    autoApplicable: true,
  },
  {
    name: 'add-error-handling',
    description: 'Wrap in try-catch block',
    categories: ['error-handling', 'safety'],
    languages: ['typescript', 'javascript'],
    match: /await\s+(.+)/,
    replacement: 'try {\n  await $1\n} catch (error) {\n  console.error(error);\n  throw error;\n}',
    confidence: 'low',
    autoApplicable: false,
  },
];

// ============================================================================
// Fix Diff Types
// ============================================================================

export interface FixDiff {
  /** File path */
  filePath: string;
  /** Original content */
  original: string;
  /** Fixed content */
  fixed: string;
  /** Unified diff string */
  unifiedDiff: string;
  /** Number of additions */
  additions: number;
  /** Number of deletions */
  deletions: number;
  /** Fixes applied */
  fixesApplied: CodeFix[];
}

// ============================================================================
// Auto-Fix Service Interface
// ============================================================================

export interface AutoFixService {
  /** Generate fixes for review comments */
  generateFixes(context: FixGenerationContext): FixGenerationResult;

  /** Apply fixes to files */
  applyFixes(fixes: CodeFix[], options?: FixApplicationOptions): FixApplicationResult;

  /** Validate fixes before applying */
  validateFixes(fixes: CodeFix[], fileContent: string): Map<string, FixValidation>;

  /** Generate diff for fixes */
  generateDiff(fixes: CodeFix[], fileContent: string): FixDiff;

  /** Get fix suggestions as markdown */
  formatAsMarkdown(suggestions: FixSuggestion[]): string;
}
