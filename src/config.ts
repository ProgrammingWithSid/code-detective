import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Config, ConfigSchema } from './types';
import * as dotenv from 'dotenv';

dotenv.config();

export class ConfigLoader {
  static load(configPath?: string): Config {
    const defaultPath = join(process.cwd(), 'code-sherlock.config.json');
    const path = configPath || defaultPath;

    let configData: any = {};

    if (existsSync(path)) {
      const fileContent = readFileSync(path, 'utf-8');
      configData = JSON.parse(fileContent);
    }

    // Merge with environment variables
    const envConfig: any = {
      aiProvider: process.env.AI_PROVIDER || configData.aiProvider,
    };

    // Only add openai if apiKey is provided
    const openaiApiKey = process.env.OPENAI_API_KEY || configData.openai?.apiKey;
    if (openaiApiKey) {
      envConfig.openai = {
        apiKey: openaiApiKey,
        model: process.env.OPENAI_MODEL || configData.openai?.model || 'gpt-4-turbo-preview',
      };
    }

    // Only add claude if apiKey is provided
    const claudeApiKey = process.env.CLAUDE_API_KEY || configData.claude?.apiKey;
    if (claudeApiKey) {
      envConfig.claude = {
        apiKey: claudeApiKey,
        model: process.env.CLAUDE_MODEL || configData.claude?.model || 'claude-3-5-sonnet-20241022',
      };
    }

    // Only add github if token is provided
    const githubToken = process.env.GITHUB_TOKEN || configData.github?.token;
    if (githubToken) {
      envConfig.github = {
        token: githubToken,
      };
    }

    // Only add gitlab if token is provided
    const gitlabToken = process.env.GITLAB_TOKEN || configData.gitlab?.token;
    const gitlabProjectId = process.env.GITLAB_PROJECT_ID || configData.gitlab?.projectId;
    if (gitlabToken && gitlabProjectId) {
      envConfig.gitlab = {
        token: gitlabToken,
        projectId: gitlabProjectId,
      };
    }

    const mergedConfig = {
      ...configData,
      ...envConfig,
      globalRules: configData.globalRules || [],
    };

    return ConfigSchema.parse(mergedConfig);
  }

  static validate(config: Config): void {
    if (config.aiProvider === 'openai' && !config.openai?.apiKey) {
      throw new Error('OpenAI API key is required when using OpenAI provider');
    }

    if (config.aiProvider === 'claude' && !config.claude?.apiKey) {
      throw new Error('Claude API key is required when using Claude provider');
    }

    if (!config.github?.token && !config.gitlab?.token) {
      throw new Error('Either GitHub or GitLab token is required');
    }
  }
}
