/**
 * Tests for Command Parser
 */

import {
  CommandParser,
  createParser,
  hasSherlockCommand,
  extractCodeBlock,
  buildContextFromWebhook,
} from '../src/conversation/command-parser';
import { CommandType, CommandContext } from '../src/types/commands';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockContext = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  prNumber: 123,
  commentId: 456,
  owner: 'test-owner',
  repo: 'test-repo',
  user: 'test-user',
  fullCommentBody: '@sherlock review',
  ...overrides,
});

// ============================================================================
// CommandParser Tests
// ============================================================================

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    parser = new CommandParser();
  });

  describe('hasCommand', () => {
    it('should detect @sherlock command in text', () => {
      expect(parser.hasCommand('@sherlock review')).toBe(true);
      expect(parser.hasCommand('Please @sherlock review this')).toBe(true);
      expect(parser.hasCommand('@SHERLOCK help')).toBe(true);
    });

    it('should return false when no command present', () => {
      expect(parser.hasCommand('Just a regular comment')).toBe(false);
      expect(parser.hasCommand('sherlock without @')).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse basic review command', () => {
      const context = createMockContext({ fullCommentBody: '@sherlock review' });
      const result = parser.parse('@sherlock review', context);

      expect(result).not.toBeNull();
      expect(result?.type).toBe(CommandType.REVIEW);
      expect(result?.args).toEqual([]);
    });

    it('should parse command with file argument', () => {
      const text = '@sherlock review src/utils.ts';
      const context = createMockContext({ fullCommentBody: text });
      const result = parser.parse(text, context);

      expect(result?.type).toBe(CommandType.REVIEW);
      expect(result?.args).toEqual(['src/utils.ts']);
    });

    it('should parse command with options', () => {
      const text = '@sherlock review --focus=security --verbose';
      const context = createMockContext({ fullCommentBody: text });
      const result = parser.parse(text, context);

      expect(result?.type).toBe(CommandType.REVIEW);
      expect(result?.options).toEqual({
        focus: 'security',
        verbose: true,
      });
    });

    it('should parse explain command', () => {
      const text = '@sherlock explain what does this function do?';
      const context = createMockContext({ fullCommentBody: text });
      const result = parser.parse(text, context);

      expect(result?.type).toBe(CommandType.EXPLAIN);
      expect(result?.args).toContain('what');
    });

    it('should parse help command', () => {
      const text = '@sherlock help review';
      const context = createMockContext({ fullCommentBody: text });
      const result = parser.parse(text, context);

      expect(result?.type).toBe(CommandType.HELP);
      expect(result?.args).toEqual(['review']);
    });

    it('should handle command aliases', () => {
      const text = '@sherlock check src/api.ts';
      const context = createMockContext({ fullCommentBody: text });
      const result = parser.parse(text, context);

      expect(result?.type).toBe(CommandType.REVIEW);
    });

    it('should return null for invalid command', () => {
      const text = '@sherlock unknowncommand';
      const context = createMockContext({ fullCommentBody: text });
      const result = parser.parse(text, context);

      expect(result).toBeNull();
    });

    it('should handle quoted arguments', () => {
      const text = '@sherlock ask "how does this work?"';
      const context = createMockContext({ fullCommentBody: text });
      const result = parser.parse(text, context);

      expect(result?.type).toBe(CommandType.ASK);
      expect(result?.args).toContain('how does this work?');
    });
  });

  describe('parseAll', () => {
    it('should parse multiple commands in one comment', () => {
      const text = '@sherlock review\n\nAlso @sherlock summarize please';
      const context = createMockContext({ fullCommentBody: text });
      const results = parser.parseAll(text, context);

      expect(results).toHaveLength(2);
      expect(results[0]?.type).toBe(CommandType.REVIEW);
      expect(results[1]?.type).toBe(CommandType.SUMMARIZE);
    });
  });

  describe('parseCommandType', () => {
    it('should map standard commands', () => {
      expect(parser.parseCommandType('review')).toBe(CommandType.REVIEW);
      expect(parser.parseCommandType('explain')).toBe(CommandType.EXPLAIN);
      expect(parser.parseCommandType('fix')).toBe(CommandType.FIX);
      expect(parser.parseCommandType('test')).toBe(CommandType.TEST);
      expect(parser.parseCommandType('summarize')).toBe(CommandType.SUMMARIZE);
      expect(parser.parseCommandType('ignore')).toBe(CommandType.IGNORE);
      expect(parser.parseCommandType('help')).toBe(CommandType.HELP);
      expect(parser.parseCommandType('ask')).toBe(CommandType.ASK);
    });

    it('should map aliases', () => {
      expect(parser.parseCommandType('check')).toBe(CommandType.REVIEW);
      expect(parser.parseCommandType('describe')).toBe(CommandType.EXPLAIN);
      expect(parser.parseCommandType('suggest')).toBe(CommandType.FIX);
      expect(parser.parseCommandType('walkthrough')).toBe(CommandType.SUMMARIZE);
      expect(parser.parseCommandType('?')).toBe(CommandType.HELP);
    });

    it('should be case insensitive by default', () => {
      expect(parser.parseCommandType('REVIEW')).toBe(CommandType.REVIEW);
      expect(parser.parseCommandType('Review')).toBe(CommandType.REVIEW);
    });

    it('should return null for unknown commands', () => {
      expect(parser.parseCommandType('unknown')).toBeNull();
      expect(parser.parseCommandType('')).toBeNull();
    });
  });
});

// ============================================================================
// Parser Options Tests
// ============================================================================

describe('CommandParser with options', () => {
  it('should support custom prefix', () => {
    const parser = new CommandParser({ prefix: '@bot' });
    const text = '@bot review';
    const context = createMockContext({ fullCommentBody: text });

    expect(parser.hasCommand(text)).toBe(true);
    const result = parser.parse(text, context);
    expect(result?.type).toBe(CommandType.REVIEW);
  });

  it('should support case sensitive mode', () => {
    const parser = new CommandParser({ caseSensitive: true });

    expect(parser.parseCommandType('review')).toBe(CommandType.REVIEW);
    expect(parser.parseCommandType('REVIEW')).toBeNull();
  });

  it('should support custom aliases', () => {
    const parser = new CommandParser({
      customAliases: {
        analyze: CommandType.REVIEW,
        inspect: CommandType.EXPLAIN,
      },
    });

    expect(parser.parseCommandType('analyze')).toBe(CommandType.REVIEW);
    expect(parser.parseCommandType('inspect')).toBe(CommandType.EXPLAIN);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('createParser', () => {
  it('should create a CommandParser instance', () => {
    const parser = createParser();
    expect(parser).toBeInstanceOf(CommandParser);
  });

  it('should pass options to parser', () => {
    const parser = createParser({ prefix: '@custom' });
    expect(parser.hasCommand('@custom review')).toBe(true);
    expect(parser.hasCommand('@sherlock review')).toBe(false);
  });
});

describe('hasSherlockCommand', () => {
  it('should detect sherlock commands', () => {
    expect(hasSherlockCommand('@sherlock review')).toBe(true);
    expect(hasSherlockCommand('please @sherlock help')).toBe(true);
    expect(hasSherlockCommand('no command here')).toBe(false);
  });
});

describe('extractCodeBlock', () => {
  it('should extract code block with language', () => {
    const text = 'Here is code:\n```typescript\nconst x = 1;\n```\nMore text';
    const result = extractCodeBlock(text);

    expect(result).not.toBeNull();
    expect(result?.language).toBe('typescript');
    expect(result?.code).toBe('const x = 1;');
  });

  it('should extract code block without language', () => {
    const text = '```\nsome code\n```';
    const result = extractCodeBlock(text);

    expect(result).not.toBeNull();
    expect(result?.language).toBe('text');
    expect(result?.code).toBe('some code');
  });

  it('should return null when no code block', () => {
    const text = 'Just regular text';
    const result = extractCodeBlock(text);

    expect(result).toBeNull();
  });
});

describe('buildContextFromWebhook', () => {
  it('should build context from GitHub webhook payload', () => {
    const payload = {
      pull_request: { number: 42 },
      comment: {
        id: 123,
        body: '@sherlock review',
        user: { login: 'developer' },
        path: 'src/index.ts',
        line: 10,
      },
      repository: {
        owner: { login: 'org' },
        name: 'repo',
      },
    };

    const context = buildContextFromWebhook(payload);

    expect(context.prNumber).toBe(42);
    expect(context.commentId).toBe(123);
    expect(context.owner).toBe('org');
    expect(context.repo).toBe('repo');
    expect(context.user).toBe('developer');
    expect(context.filePath).toBe('src/index.ts');
    expect(context.lineNumber).toBe(10);
    expect(context.fullCommentBody).toBe('@sherlock review');
  });

  it('should handle issue comments (without path/line)', () => {
    const payload = {
      issue: { number: 99 },
      comment: {
        id: 456,
        body: '@sherlock summarize',
        user: { login: 'user' },
      },
      repository: {
        owner: { login: 'company' },
        name: 'project',
      },
    };

    const context = buildContextFromWebhook(payload);

    expect(context.prNumber).toBe(99);
    expect(context.filePath).toBeUndefined();
    expect(context.lineNumber).toBeUndefined();
  });
});
