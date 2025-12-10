/**
 * Conversation Module - Conversational AI for @sherlock commands
 */

// Command Parser
export {
  CommandParser,
  createParser,
  hasSherlockCommand,
  extractCodeBlock,
  buildContextFromWebhook,
} from './command-parser';
export type { ParserOptions } from './command-parser';

// Chat Handler
export { ChatHandler, createChatHandler } from './chat-handler';
export type { ChatHandlerOptions } from './chat-handler';

// Code Explainer
export { CodeExplainer, createCodeExplainer, formatExplanationAsMarkdown } from './explain-code';
export type { ExplanationOptions, CodeExplanation } from './explain-code';

// Test Generator
export { TestGenerator, createTestGenerator, formatTestsAsMarkdown } from './generate-tests';
export type { TestGenerationOptions, TestGenerationResult, GeneratedTest } from './generate-tests';
