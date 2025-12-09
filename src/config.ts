import * as dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Config, ConfigSchema, ConfigurationError } from './types';

dotenv.config();

// ============================================================================
// Types
// ============================================================================

interface RawConfigData {
  aiProvider?: string;
  openai?: {
    apiKey?: string;
    model?: string;
  };
  claude?: {
    apiKey?: string;
    model?: string;
  };
  globalRules?: string[];
  repository?: {
    owner?: string;
    repo?: string;
    baseBranch?: string;
  };
  pr?: {
    number?: number;
    baseBranch?: string;
  };
  github?: {
    token?: string;
  };
  gitlab?: {
    token?: string;
    projectId?: string;
  };
}

interface EnvironmentConfig {
  aiProvider?: string;
  openai?: {
    apiKey: string;
    model: string;
  };
  claude?: {
    apiKey: string;
    model: string;
  };
  github?: {
    token: string;
  };
  gitlab?: {
    token: string;
    projectId: string;
  };
}

// ============================================================================
// ConfigLoader
// ============================================================================

export class ConfigLoader {
  /**
   * Load configuration from file and environment variables
   * @param configPath - Optional path to config file
   */
  static load(configPath?: string): Config {
    const defaultPath = join(process.cwd(), 'code-sherlock.config.json');
    const path = configPath ?? defaultPath;

    const fileConfig = this.loadFromFile(path);
    const envConfig = this.loadFromEnvironment(fileConfig);
    const mergedConfig = this.mergeConfigs(fileConfig, envConfig);

    return this.parseConfig(mergedConfig);
  }

  /**
   * Validate the configuration
   * @param config - Configuration to validate
   */
  static validate(config: Config): void {
    if (config.aiProvider === 'openai' && !config.openai?.apiKey) {
      throw new ConfigurationError('OpenAI API key is required when using OpenAI provider');
    }

    if (config.aiProvider === 'claude' && !config.claude?.apiKey) {
      throw new ConfigurationError('Claude API key is required when using Claude provider');
    }

    if (!config.github?.token && !config.gitlab?.token) {
      throw new ConfigurationError('Either GitHub or GitLab token is required');
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private static loadFromFile(path: string): RawConfigData {
    if (!existsSync(path)) {
      return {};
    }

    try {
      const fileContent = readFileSync(path, 'utf-8');
      return JSON.parse(fileContent) as RawConfigData;
    } catch (error) {
      throw new ConfigurationError(
        `Failed to parse config file: ${path}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private static loadFromEnvironment(fileConfig: RawConfigData): EnvironmentConfig {
    const envConfig: EnvironmentConfig = {
      aiProvider: process.env.AI_PROVIDER ?? fileConfig.aiProvider,
    };

    // OpenAI configuration
    const openaiApiKey = process.env.OPENAI_API_KEY ?? fileConfig.openai?.apiKey;
    if (openaiApiKey) {
      envConfig.openai = {
        apiKey: openaiApiKey,
        model: process.env.OPENAI_MODEL ?? fileConfig.openai?.model ?? 'gpt-4-turbo-preview',
      };
    }

    // Claude configuration
    const claudeApiKey = process.env.CLAUDE_API_KEY ?? fileConfig.claude?.apiKey;
    if (claudeApiKey) {
      envConfig.claude = {
        apiKey: claudeApiKey,
        model: process.env.CLAUDE_MODEL ?? fileConfig.claude?.model ?? 'claude-3-5-sonnet-20241022',
      };
    }

    // GitHub configuration
    const githubToken = process.env.GITHUB_TOKEN ?? fileConfig.github?.token;
    if (githubToken) {
      envConfig.github = {
        token: githubToken,
      };
    }

    // GitLab configuration
    const gitlabToken = process.env.GITLAB_TOKEN ?? fileConfig.gitlab?.token;
    const gitlabProjectId = process.env.GITLAB_PROJECT_ID ?? fileConfig.gitlab?.projectId;
    if (gitlabToken && gitlabProjectId) {
      envConfig.gitlab = {
        token: gitlabToken,
        projectId: gitlabProjectId,
      };
    }

    return envConfig;
  }

  private static mergeConfigs(
    fileConfig: RawConfigData,
    envConfig: EnvironmentConfig
  ): RawConfigData {
    return {
      ...fileConfig,
      ...envConfig,
      globalRules: fileConfig.globalRules ?? [],
    };
  }

  private static parseConfig(config: RawConfigData): Config {
    const result = ConfigSchema.safeParse(config);

    if (!result.success) {
      const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ConfigurationError(`Invalid configuration: ${errors}`);
    }

    return result.data;
  }
}
