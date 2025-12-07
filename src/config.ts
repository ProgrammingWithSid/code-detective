import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Config, ConfigSchema } from './types';
import * as dotenv from 'dotenv';

dotenv.config();

export class ConfigLoader {
  static load(configPath?: string): Config {
    const defaultPath = join(process.cwd(), 'code-detective.config.json');
    const path = configPath || defaultPath;

    let configData: any = {};

    if (existsSync(path)) {
      const fileContent = readFileSync(path, 'utf-8');
      configData = JSON.parse(fileContent);
    }

    // Merge with environment variables
    const envConfig: any = {
      aiProvider: process.env.AI_PROVIDER || configData.aiProvider,
      openai: {
        apiKey: process.env.OPENAI_API_KEY || configData.openai?.apiKey,
        model: process.env.OPENAI_MODEL || configData.openai?.model || 'gpt-4-turbo-preview',
      },
      claude: {
        apiKey: process.env.CLAUDE_API_KEY || configData.claude?.apiKey,
        model: process.env.CLAUDE_MODEL || configData.claude?.model || 'claude-3-5-sonnet-20241022',
      },
      github: {
        token: process.env.GITHUB_TOKEN || configData.github?.token,
      },
      gitlab: {
        token: process.env.GITLAB_TOKEN || configData.gitlab?.token,
        projectId: process.env.GITLAB_PROJECT_ID || configData.gitlab?.projectId,
      },
    };

    // Remove undefined values
    Object.keys(envConfig).forEach(key => {
      if (envConfig[key] === undefined) {
        delete envConfig[key];
      }
    });

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
