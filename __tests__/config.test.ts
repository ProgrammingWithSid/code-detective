import { ConfigLoader } from '../src/config';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

jest.mock('fs');
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

describe('ConfigLoader', () => {
  const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
  const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('load', () => {
    it('should load config from file', () => {
      const configData = {
        aiProvider: 'openai',
        openai: {
          apiKey: 'test-key',
          model: 'gpt-4',
        },
        globalRules: ['rule1', 'rule2'],
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
        claude: {
          apiKey: '',
          model: 'claude-3-5-sonnet-20241022',
        },
        gitlab: {
          token: '',
          projectId: '',
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = ConfigLoader.load();

      expect(config.aiProvider).toBe('openai');
      expect(config.openai?.apiKey).toBe('test-key');
      expect(config.globalRules).toEqual(['rule1', 'rule2']);
    });

    it('should merge environment variables', () => {
      process.env.OPENAI_API_KEY = 'env-key';
      process.env.OPENAI_MODEL = 'gpt-3.5-turbo';
      process.env.GITHUB_TOKEN = 'env-token';

      const configData = {
        aiProvider: 'openai',
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
        openai: {
          apiKey: '',
          model: 'gpt-4-turbo-preview',
        },
        claude: {
          apiKey: '',
          model: 'claude-3-5-sonnet-20241022',
        },
        github: {
          token: '',
        },
        gitlab: {
          token: '',
          projectId: '',
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = ConfigLoader.load();

      expect(config.openai?.apiKey).toBe('env-key');
      expect(config.openai?.model).toBe('gpt-3.5-turbo');
      expect(config.github?.token).toBe('env-token');
    });

    it('should use default config file path if not specified', () => {
      mockExistsSync.mockReturnValue(false);

      // Should throw when required fields are missing
      expect(() => ConfigLoader.load()).toThrow();
      expect(mockExistsSync).toHaveBeenCalled();
    });

    it('should use custom config file path if specified', () => {
      mockExistsSync.mockReturnValue(false);

      // Should throw when required fields are missing
      expect(() => ConfigLoader.load('custom-config.json')).toThrow();
      expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('custom-config.json'));
    });

    it('should default globalRules to empty array if not provided', () => {
      const configData = {
        aiProvider: 'openai',
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = ConfigLoader.load();

      expect(config.globalRules).toEqual([]);
    });
  });

  describe('validate', () => {
    it('should throw error if OpenAI API key is missing', () => {
      const config = {
        aiProvider: 'openai' as const,
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
      };

      expect(() => ConfigLoader.validate(config as any)).toThrow('OpenAI API key is required');
    });

    it('should throw error if Claude API key is missing', () => {
      const config = {
        aiProvider: 'claude' as const,
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
      };

      expect(() => ConfigLoader.validate(config as any)).toThrow('Claude API key is required');
    });

    it('should throw error if neither GitHub nor GitLab token is provided', () => {
      const config = {
        aiProvider: 'openai' as const,
        openai: {
          apiKey: 'test-key',
        },
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
        },
        pr: {
          number: 123,
        },
      };

      expect(() => ConfigLoader.validate(config as any)).toThrow('Either GitHub or GitLab token is required');
    });

    it('should pass validation with valid config', () => {
      const config = {
        aiProvider: 'openai' as const,
        openai: {
          apiKey: 'test-key',
        },
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
        },
        pr: {
          number: 123,
        },
        github: {
          token: 'test-token',
        },
      };

      expect(() => ConfigLoader.validate(config as any)).not.toThrow();
    });
  });
});
