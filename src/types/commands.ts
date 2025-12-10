/**
 * Command Types for @sherlock conversational AI
 */

// ============================================================================
// Command Enums & Constants
// ============================================================================

export const COMMAND_PREFIX = '@sherlock';

export const CommandType = {
  REVIEW: 'review',
  EXPLAIN: 'explain',
  FIX: 'fix',
  TEST: 'test',
  SUMMARIZE: 'summarize',
  IGNORE: 'ignore',
  CONFIG: 'config',
  HELP: 'help',
  ASK: 'ask',
} as const;

export type CommandType = (typeof CommandType)[keyof typeof CommandType];

export const COMMAND_ALIASES: Record<string, CommandType> = {
  review: CommandType.REVIEW,
  'review-file': CommandType.REVIEW,
  check: CommandType.REVIEW,
  explain: CommandType.EXPLAIN,
  'what-is': CommandType.EXPLAIN,
  describe: CommandType.EXPLAIN,
  fix: CommandType.FIX,
  suggest: CommandType.FIX,
  repair: CommandType.FIX,
  test: CommandType.TEST,
  'generate-test': CommandType.TEST,
  'write-test': CommandType.TEST,
  summarize: CommandType.SUMMARIZE,
  summary: CommandType.SUMMARIZE,
  walkthrough: CommandType.SUMMARIZE,
  ignore: CommandType.IGNORE,
  skip: CommandType.IGNORE,
  exclude: CommandType.IGNORE,
  config: CommandType.CONFIG,
  settings: CommandType.CONFIG,
  help: CommandType.HELP,
  '?': CommandType.HELP,
  ask: CommandType.ASK,
  question: CommandType.ASK,
};

// ============================================================================
// Command Interfaces
// ============================================================================

export interface CommandContext {
  /** The PR number where command was invoked */
  prNumber: number;
  /** The comment ID that contained the command */
  commentId: number;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** User who invoked the command */
  user: string;
  /** File path if command was on a specific file */
  filePath?: string;
  /** Line number if command was on a specific line */
  lineNumber?: number;
  /** The code snippet being referenced (if any) */
  codeSnippet?: string;
  /** Full comment body for additional context */
  fullCommentBody: string;
}

export interface ParsedCommand {
  /** The command type */
  type: CommandType;
  /** Raw command string */
  raw: string;
  /** Arguments passed to command */
  args: string[];
  /** Named options (--key=value) */
  options: Record<string, string | boolean>;
  /** Context of where command was invoked */
  context: CommandContext;
  /** Additional text after the command */
  additionalText?: string;
}

// ============================================================================
// Command Response Types
// ============================================================================

export type ResponseType = 'comment' | 'review' | 'suggestion' | 'reaction';

export interface CommandResponse {
  /** Type of response */
  type: ResponseType;
  /** Response content (markdown) */
  body: string;
  /** Optional code suggestion */
  suggestion?: CodeSuggestion;
  /** Whether to quote the original comment */
  quoteOriginal?: boolean;
  /** Reaction emoji to add */
  reaction?: string;
}

export interface CodeSuggestion {
  filePath: string;
  startLine: number;
  endLine: number;
  originalCode: string;
  suggestedCode: string;
  explanation: string;
}

// ============================================================================
// Command Handler Interface
// ============================================================================

export interface CommandHandler {
  /** Command type this handler processes */
  type: CommandType;
  /** Description for help text */
  description: string;
  /** Usage examples */
  examples: string[];
  /** Execute the command (can be sync or async) */
  execute(command: ParsedCommand): CommandResponse | Promise<CommandResponse>;
}

// ============================================================================
// Command Registry
// ============================================================================

export interface CommandRegistry {
  /** Register a command handler */
  register(handler: CommandHandler): void;
  /** Get handler for a command type */
  get(type: CommandType): CommandHandler | undefined;
  /** Get all registered handlers */
  getAll(): CommandHandler[];
  /** Check if command type is registered */
  has(type: CommandType): boolean;
}

// ============================================================================
// Help Text Definitions
// ============================================================================

export const COMMAND_HELP: Record<
  CommandType,
  { desc: string; usage: string; examples: string[] }
> = {
  [CommandType.REVIEW]: {
    desc: 'Trigger a code review on the PR or specific file',
    usage: '@sherlock review [file-path] [--focus=security|performance|all]',
    examples: [
      '@sherlock review',
      '@sherlock review src/utils.ts',
      '@sherlock review --focus=security',
    ],
  },
  [CommandType.EXPLAIN]: {
    desc: 'Explain what the selected code does',
    usage: '@sherlock explain [question]',
    examples: [
      '@sherlock explain',
      '@sherlock explain what does this function do?',
      '@sherlock explain the authentication flow',
    ],
  },
  [CommandType.FIX]: {
    desc: 'Suggest a fix for the highlighted issue',
    usage: '@sherlock fix [issue-description]',
    examples: ['@sherlock fix', '@sherlock fix this null check', '@sherlock fix memory leak'],
  },
  [CommandType.TEST]: {
    desc: 'Generate unit tests for the selected code',
    usage: '@sherlock test [--framework=jest|vitest|mocha]',
    examples: ['@sherlock test', '@sherlock test --framework=vitest'],
  },
  [CommandType.SUMMARIZE]: {
    desc: 'Generate a summary/walkthrough of PR changes',
    usage: '@sherlock summarize [--format=brief|detailed]',
    examples: ['@sherlock summarize', '@sherlock summarize --format=detailed'],
  },
  [CommandType.IGNORE]: {
    desc: 'Ignore a file or pattern from reviews',
    usage: '@sherlock ignore <file-or-pattern>',
    examples: ['@sherlock ignore package-lock.json', '@sherlock ignore **/*.test.ts'],
  },
  [CommandType.CONFIG]: {
    desc: 'Show or update review configuration',
    usage: '@sherlock config [key] [value]',
    examples: ['@sherlock config', '@sherlock config focus security'],
  },
  [CommandType.HELP]: {
    desc: 'Show available commands and usage',
    usage: '@sherlock help [command]',
    examples: ['@sherlock help', '@sherlock help review'],
  },
  [CommandType.ASK]: {
    desc: 'Ask a question about the codebase',
    usage: '@sherlock ask <question>',
    examples: [
      '@sherlock ask how does error handling work here?',
      '@sherlock ask is this implementation secure?',
    ],
  },
};
