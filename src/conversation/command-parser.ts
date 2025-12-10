/**
 * Command Parser - Parses @sherlock commands from PR comments
 */

import {
  CommandContext,
  CommandType,
  COMMAND_ALIASES,
  COMMAND_PREFIX,
  ParsedCommand,
} from '../types/commands';

// ============================================================================
// Parser Options
// ============================================================================

export interface ParserOptions {
  /** Custom command prefix (default: @sherlock) */
  prefix?: string;
  /** Case sensitive matching (default: false) */
  caseSensitive?: boolean;
  /** Additional command aliases */
  customAliases?: Record<string, CommandType>;
}

// ============================================================================
// Command Parser Class
// ============================================================================

export class CommandParser {
  private prefix: string;
  private caseSensitive: boolean;
  private aliases: Record<string, CommandType>;
  private commandRegex: RegExp;

  constructor(options: ParserOptions = {}) {
    this.prefix = options.prefix ?? COMMAND_PREFIX;
    this.caseSensitive = options.caseSensitive ?? false;
    this.aliases = { ...COMMAND_ALIASES, ...options.customAliases };

    // Build regex to match command prefix
    // Use non-greedy match and stop at newline or next @sherlock
    const escapedPrefix = this.escapeRegex(this.prefix);
    const flags = this.caseSensitive ? 'gm' : 'gim';
    this.commandRegex = new RegExp(`${escapedPrefix}\\s+(\\S+)(?:\\s+([^\\n@]*))?`, flags);
  }

  /**
   * Check if a comment contains a sherlock command
   */
  hasCommand(text: string): boolean {
    const searchText = this.caseSensitive ? text : text.toLowerCase();
    const prefix = this.caseSensitive ? this.prefix : this.prefix.toLowerCase();
    return searchText.includes(prefix);
  }

  /**
   * Parse all commands from a comment
   */
  parseAll(text: string, context: CommandContext): ParsedCommand[] {
    const commands: ParsedCommand[] = [];
    const matches = text.matchAll(this.commandRegex);

    for (const match of matches) {
      const parsed = this.parseMatch(match, context);
      if (parsed) {
        commands.push(parsed);
      }
    }

    return commands;
  }

  /**
   * Parse the first command from a comment
   */
  parse(text: string, context: CommandContext): ParsedCommand | null {
    const commands = this.parseAll(text, context);
    return commands[0] ?? null;
  }

  /**
   * Parse command type from string
   */
  parseCommandType(commandStr: string): CommandType | null {
    const normalized = this.caseSensitive ? commandStr : commandStr.toLowerCase();
    return this.aliases[normalized] ?? null;
  }

  /**
   * Get all valid command names
   */
  getValidCommands(): string[] {
    return Object.keys(this.aliases);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private parseMatch(match: RegExpMatchArray, context: CommandContext): ParsedCommand | null {
    const [fullMatch, commandStr, argsStr] = match;

    if (!commandStr) return null;

    const type = this.parseCommandType(commandStr);
    if (!type) return null;

    const { args, options, additionalText } = this.parseArguments(argsStr ?? '');

    return {
      type,
      raw: fullMatch,
      args,
      options,
      context,
      additionalText,
    };
  }

  private parseArguments(argsStr: string): {
    args: string[];
    options: Record<string, string | boolean>;
    additionalText?: string;
  } {
    const args: string[] = [];
    const options: Record<string, string | boolean> = {};
    let additionalText: string | undefined;

    if (!argsStr.trim()) {
      return { args, options };
    }

    // Split by spaces, but respect quotes
    const tokens = this.tokenize(argsStr);

    for (const token of tokens) {
      if (token.startsWith('--')) {
        // Long option: --key=value or --flag
        const optionMatch = token.match(/^--(\w[\w-]*)(?:=(.*))?$/);
        if (optionMatch && optionMatch[1]) {
          const key = optionMatch[1];
          const value = optionMatch[2];
          options[key] = value ?? true;
        }
      } else if (token.startsWith('-') && token.length === 2) {
        // Short option: -f
        options[token.slice(1)] = true;
      } else {
        // Regular argument
        args.push(token);
      }
    }

    // Everything after arguments could be additional context
    if (args.length > 0) {
      const lastArg = args[args.length - 1];
      if (lastArg) {
        const lastArgIndex = argsStr.lastIndexOf(lastArg);
        const remaining = argsStr.slice(lastArgIndex + lastArg.length).trim();
        if (remaining) {
          additionalText = remaining;
        }
      }
    }

    return { args, options, additionalText };
  }

  private tokenize(str: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (const char of str) {
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a default parser instance
 */
export function createParser(options?: ParserOptions): CommandParser {
  return new CommandParser(options);
}

/**
 * Quick check if text contains a command
 */
export function hasSherlockCommand(text: string): boolean {
  return text.toLowerCase().includes(COMMAND_PREFIX.toLowerCase());
}

/**
 * Extract code block from comment if present
 */
export function extractCodeBlock(text: string): { code: string; language: string } | null {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/;
  const match = text.match(codeBlockRegex);

  if (match && match[2]) {
    return {
      language: match[1] ?? 'text',
      code: match[2].trim(),
    };
  }

  return null;
}

/**
 * Build context from webhook payload
 */
export function buildContextFromWebhook(payload: {
  pull_request?: { number: number };
  issue?: { number: number };
  comment: { id: number; body: string; user: { login: string }; path?: string; line?: number };
  repository: { owner: { login: string }; name: string };
}): CommandContext {
  const prNumber = payload.pull_request?.number ?? payload.issue?.number ?? 0;

  return {
    prNumber,
    commentId: payload.comment.id,
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    user: payload.comment.user.login,
    filePath: payload.comment.path,
    lineNumber: payload.comment.line,
    fullCommentBody: payload.comment.body,
  };
}
