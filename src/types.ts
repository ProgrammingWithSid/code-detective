import { z } from 'zod';

export const AIProviderSchema = z.enum(['openai', 'claude']);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const ConfigSchema = z.object({
  aiProvider: AIProviderSchema,
  openai: z.object({
    apiKey: z.string(),
    model: z.string().default('gpt-4-turbo-preview'),
  }).optional(),
  claude: z.object({
    apiKey: z.string(),
    model: z.string().default('claude-3-5-sonnet-20241022'),
  }).optional(),
  globalRules: z.array(z.string()).default([]),
  repository: z.object({
    owner: z.string(),
    repo: z.string(),
    baseBranch: z.string().default('main'),
  }),
  pr: z.object({
    number: z.number(),
    baseBranch: z.string().optional(),
  }),
  github: z.object({
    token: z.string(),
  }).optional(),
  gitlab: z.object({
    token: z.string(),
    projectId: z.string(),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface CodeChunk {
  id: string;
  name: string;
  type: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  hash?: string;
  dependencies?: string[];
}

export interface ReviewComment {
  file: string;
  line: number;
  body: string;
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  rule?: string;
}

export interface ReviewResult {
  comments: ReviewComment[];
  summary: string;
  stats: {
    errors: number;
    warnings: number;
    suggestions: number;
  };
}

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions?: number;
  deletions?: number;
}
