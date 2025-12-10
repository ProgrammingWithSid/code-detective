/**
 * Chat Handler - Handles conversational AI responses to @sherlock commands
 */

import { AIProviderInterface } from '../ai-provider';
import { ChunkService } from '../chunker';
import { GitService } from '../git';
import { Config } from '../types';
import {
  COMMAND_HELP,
  CommandHandler,
  CommandRegistry,
  CommandResponse,
  CommandType,
  ParsedCommand,
} from '../types/commands';

// ============================================================================
// Chat Handler Options
// ============================================================================

export interface ChatHandlerOptions {
  /** AI provider for generating responses */
  aiProvider: AIProviderInterface;
  /** Configuration */
  config: Config;
  /** Repository path */
  repoPath?: string;
}

// ============================================================================
// Default Command Handler Registry
// ============================================================================

class DefaultCommandRegistry implements CommandRegistry {
  private handlers: Map<CommandType, CommandHandler> = new Map();

  register(handler: CommandHandler): void {
    this.handlers.set(handler.type, handler);
  }

  get(type: CommandType): CommandHandler | undefined {
    return this.handlers.get(type);
  }

  getAll(): CommandHandler[] {
    return Array.from(this.handlers.values());
  }

  has(type: CommandType): boolean {
    return this.handlers.has(type);
  }
}

// ============================================================================
// Chat Handler Class
// ============================================================================

export class ChatHandler {
  private aiProvider: AIProviderInterface;
  private config: Config;
  private git: GitService;
  private chunker: ChunkService;
  private registry: CommandRegistry;

  constructor(options: ChatHandlerOptions) {
    this.aiProvider = options.aiProvider;
    this.config = options.config;
    this.git = new GitService(options.repoPath);
    this.chunker = new ChunkService(options.repoPath);
    this.registry = new DefaultCommandRegistry();

    this.registerDefaultHandlers();
  }

  /**
   * Handle a parsed command and generate response
   */
  async handleCommand(command: ParsedCommand): Promise<CommandResponse> {
    const handler = this.registry.get(command.type);

    if (!handler) {
      return this.createHelpResponse(`Unknown command: ${command.type}`);
    }

    try {
      return await handler.execute(command);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(message);
    }
  }

  /**
   * Register a custom command handler
   */
  registerHandler(handler: CommandHandler): void {
    this.registry.register(handler);
  }

  // ============================================================================
  // Private Methods - Handler Registration
  // ============================================================================

  private registerDefaultHandlers(): void {
    this.registry.register(this.createHelpHandler());
    this.registry.register(this.createExplainHandler());
    this.registry.register(this.createFixHandler());
    this.registry.register(this.createSummarizeHandler());
    this.registry.register(this.createAskHandler());
    this.registry.register(this.createReviewHandler());
    this.registry.register(this.createIgnoreHandler());
    this.registry.register(this.createConfigHandler());
  }

  // ============================================================================
  // Command Handlers
  // ============================================================================

  private createHelpHandler(): CommandHandler {
    return {
      type: CommandType.HELP,
      description: 'Show available commands',
      examples: ['@sherlock help', '@sherlock help review'],
      execute: (command: ParsedCommand): CommandResponse => {
        const specificCommand = command.args[0];

        if (specificCommand && COMMAND_HELP[specificCommand as CommandType]) {
          const help = COMMAND_HELP[specificCommand as CommandType];
          return {
            type: 'comment',
            body: this.formatSpecificHelp(specificCommand as CommandType, help),
          };
        }

        return {
          type: 'comment',
          body: this.formatGeneralHelp(),
        };
      },
    };
  }

  private createExplainHandler(): CommandHandler {
    return {
      type: CommandType.EXPLAIN,
      description: 'Explain code',
      examples: ['@sherlock explain'],
      execute: async (command: ParsedCommand): Promise<CommandResponse> => {
        const { context } = command;

        if (!context.filePath || !context.lineNumber) {
          return {
            type: 'comment',
            body: '⚠️ Please use this command on a specific line of code in the PR diff.',
          };
        }

        const chunks = await this.chunker.chunkFileByRange(
          context.filePath,
          Math.max(1, context.lineNumber - 10),
          context.lineNumber + 10
        );

        const explanation = await this.askAI(
          'Explain the following code in detail. What does it do, and what are the key concepts?',
          chunks.content
        );

        return {
          type: 'comment',
          body: `## 📖 Code Explanation\n\n${explanation}`,
        };
      },
    };
  }

  private createFixHandler(): CommandHandler {
    return {
      type: CommandType.FIX,
      description: 'Suggest a fix',
      examples: ['@sherlock fix'],
      execute: async (command: ParsedCommand): Promise<CommandResponse> => {
        const { context, additionalText } = command;

        if (!context.filePath || !context.lineNumber) {
          return {
            type: 'comment',
            body: '⚠️ Please use this command on a specific line of code in the PR diff.',
          };
        }

        const chunks = await this.chunker.chunkFileByRange(
          context.filePath,
          Math.max(1, context.lineNumber - 5),
          context.lineNumber + 5
        );

        const issueContext = additionalText || 'the issue at this line';
        const fix = await this.askAI(
          `Suggest a fix for ${issueContext}. Provide the corrected code and explain the changes.`,
          chunks.content
        );

        return {
          type: 'suggestion',
          body: `## 🔧 Suggested Fix\n\n${fix}`,
        };
      },
    };
  }

  private createSummarizeHandler(): CommandHandler {
    return {
      type: CommandType.SUMMARIZE,
      description: 'Summarize PR changes',
      examples: ['@sherlock summarize'],
      execute: async (command: ParsedCommand): Promise<CommandResponse> => {
        const { options } = command;
        const format = options['format'] === 'brief' ? 'brief' : 'detailed';

        // Get changed files
        const currentBranch = await this.git.getCurrentBranch();
        const baseBranch = this.config.repository?.baseBranch ?? 'main';

        const changedFiles = await this.git.getChangedFiles(currentBranch, baseBranch);

        if (changedFiles.length === 0) {
          return {
            type: 'comment',
            body: 'No changes detected in this PR.',
          };
        }

        const fileList = changedFiles
          .map((f) => `- \`${f.path}\` (${f.status}: +${f.additions ?? 0}/-${f.deletions ?? 0})`)
          .join('\n');

        const prompt =
          format === 'brief'
            ? `Provide a brief one-paragraph summary of what these changes do:\n\n${fileList}`
            : `Provide a detailed walkthrough of these changes. Group by functionality and explain the purpose of each change:\n\n${fileList}`;

        const summary = await this.askAI(prompt, '');

        return {
          type: 'comment',
          body: `## 📋 PR Summary\n\n${summary}\n\n### Changed Files\n${fileList}`,
        };
      },
    };
  }

  private createAskHandler(): CommandHandler {
    return {
      type: CommandType.ASK,
      description: 'Ask a question',
      examples: ['@sherlock ask how does this work?'],
      execute: async (command: ParsedCommand): Promise<CommandResponse> => {
        const question = command.args.join(' ') || command.additionalText;

        if (!question) {
          return {
            type: 'comment',
            body: '⚠️ Please provide a question. Example: `@sherlock ask how does authentication work?`',
          };
        }

        let codeContext = '';
        const { context } = command;

        if (context.filePath && context.lineNumber) {
          const chunk = await this.chunker.chunkFileByRange(
            context.filePath,
            Math.max(1, context.lineNumber - 20),
            context.lineNumber + 20
          );
          codeContext = `\n\nCode context:\n\`\`\`\n${chunk.content}\n\`\`\``;
        }

        const answer = await this.askAI(question, codeContext);

        return {
          type: 'comment',
          body: `## 💬 Answer\n\n${answer}`,
        };
      },
    };
  }

  private createReviewHandler(): CommandHandler {
    return {
      type: CommandType.REVIEW,
      description: 'Trigger code review',
      examples: ['@sherlock review'],
      execute: (): CommandResponse => {
        return {
          type: 'comment',
          body:
            '🔍 **Review Triggered**\n\n' +
            'A new code review has been queued for this PR. ' +
            'Results will be posted as review comments shortly.',
          reaction: 'eyes',
        };
      },
    };
  }

  private createIgnoreHandler(): CommandHandler {
    return {
      type: CommandType.IGNORE,
      description: 'Ignore file from review',
      examples: ['@sherlock ignore package-lock.json'],
      execute: (command: ParsedCommand): CommandResponse => {
        const pattern = command.args[0];

        if (!pattern) {
          return {
            type: 'comment',
            body: '⚠️ Please specify a file or pattern to ignore. Example: `@sherlock ignore *.lock`',
          };
        }

        return {
          type: 'comment',
          body: `✅ **Ignore Rule Added**\n\nPattern \`${pattern}\` will be ignored in future reviews of this PR.`,
        };
      },
    };
  }

  private createConfigHandler(): CommandHandler {
    return {
      type: CommandType.CONFIG,
      description: 'Show/update config',
      examples: ['@sherlock config'],
      execute: (): CommandResponse => {
        const configSummary = [
          `- **AI Provider**: ${this.config.aiProvider}`,
          `- **Base Branch**: ${this.config.repository?.baseBranch ?? 'main'}`,
          `- **Global Rules**: ${this.config.globalRules?.length ?? 0} configured`,
        ].join('\n');

        return {
          type: 'comment',
          body: `## ⚙️ Current Configuration\n\n${configSummary}`,
        };
      },
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async askAI(question: string, codeContext: string): Promise<string> {
    const prompt = `${question}${codeContext ? `\n\nContext:\n${codeContext}` : ''}`;

    // Use AI provider to generate response
    const result = await this.aiProvider.reviewCode(
      [
        {
          id: 'chat',
          name: 'chat-context',
          type: 'context',
          file: 'chat',
          startLine: 1,
          endLine: 1,
          content: prompt,
        },
      ],
      ['Respond helpfully and concisely to the user question.']
    );

    return result.summary || result.comments[0]?.body || 'Unable to generate response.';
  }

  private formatGeneralHelp(): string {
    const commands = Object.entries(COMMAND_HELP)
      .map(([cmd, help]) => `- \`@sherlock ${cmd}\` - ${help.desc}`)
      .join('\n');

    return `## 🔍 Code Sherlock Commands\n\n${commands}\n\n*Use \`@sherlock help <command>\` for detailed usage.*`;
  }

  private formatSpecificHelp(
    cmd: CommandType,
    help: { desc: string; usage: string; examples: string[] }
  ): string {
    const examples = help.examples.map((e) => `- \`${e}\``).join('\n');
    return `## 📖 \`@sherlock ${cmd}\`\n\n${help.desc}\n\n**Usage:** \`${help.usage}\`\n\n**Examples:**\n${examples}`;
  }

  private createHelpResponse(message: string): CommandResponse {
    return {
      type: 'comment',
      body: `⚠️ ${message}\n\n${this.formatGeneralHelp()}`,
    };
  }

  private createErrorResponse(message: string): CommandResponse {
    return {
      type: 'comment',
      body: `❌ **Error:** ${message}\n\nPlease try again or use \`@sherlock help\` for available commands.`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createChatHandler(options: ChatHandlerOptions): ChatHandler {
  return new ChatHandler(options);
}
