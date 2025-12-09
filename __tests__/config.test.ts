import { existsSync, readFileSync } from 'fs';
import { ConfigLoader } from '../src/config';
import { ConfigurationError } from '../src/types';

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
    delete process.env.GITLAB_TOKEN;
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_MODEL;
    delete process.env.CLAUDE_MODEL;
    delete process.env.GITLAB_PROJECT_ID;
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
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = ConfigLoader.load();

      expect(config.openai?.apiKey).toBe('env-key');
      expect(config.openai?.model).toBe('gpt-3.5-turbo');
      expect(config.github?.token).toBe('env-token');
    });

    it('should throw error when config file is invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid json }');

      expect(() => ConfigLoader.load()).toThrow(ConfigurationError);
    });

    it('should throw error when required fields are missing', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => ConfigLoader.load()).toThrow(ConfigurationError);
    });

    it('should use custom config file path if specified', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => ConfigLoader.load('custom-config.json')).toThrow(ConfigurationError);
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

    it('should load Claude config from environment', () => {
      process.env.CLAUDE_API_KEY = 'claude-env-key';
      process.env.CLAUDE_MODEL = 'claude-3-opus';

      const configData = {
        aiProvider: 'claude',
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

      expect(config.claude?.apiKey).toBe('claude-env-key');
      expect(config.claude?.model).toBe('claude-3-opus');
    });

    it('should load GitLab config from environment', () => {
      process.env.GITLAB_TOKEN = 'gitlab-env-token';
      process.env.GITLAB_PROJECT_ID = 'project-123';

      const configData = {
        aiProvider: 'openai',
        openai: {
          apiKey: 'test-key',
          model: 'gpt-4',
        },
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
        },
        pr: {
          number: 123,
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = ConfigLoader.load();

      expect(config.gitlab?.token).toBe('gitlab-env-token');
      expect(config.gitlab?.projectId).toBe('project-123');
    });

    it('should prefer environment variables over file config', () => {
      process.env.OPENAI_API_KEY = 'env-key';

      const configData = {
        aiProvider: 'openai',
        openai: {
          apiKey: 'file-key',
          model: 'gpt-4',
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

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configData));

      const config = ConfigLoader.load();

      expect(config.openai?.apiKey).toBe('env-key');
    });
  });

  describe('validate', () => {
    it('should throw error if OpenAI API key is missing', () => {
      const config = {
        aiProvider: 'openai' as const,
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
        globalRules: [],
      };

      expect(() => ConfigLoader.validate(config)).toThrow(ConfigurationError);
      expect(() => ConfigLoader.validate(config)).toThrow('OpenAI API key is required');
    });

    it('should throw error if Claude API key is missing', () => {
      const config = {
        aiProvider: 'claude' as const,
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
        globalRules: [],
      };

      expect(() => ConfigLoader.validate(config)).toThrow(ConfigurationError);
      expect(() => ConfigLoader.validate(config)).toThrow('Claude API key is required');
    });

    it('should throw error if neither GitHub nor GitLab token is provided', () => {
      const config = {
        aiProvider: 'openai' as const,
        openai: {
          apiKey: 'test-key',
          model: 'gpt-4',
        },
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
        globalRules: [],
      };

      expect(() => ConfigLoader.validate(config)).toThrow(ConfigurationError);
      expect(() => ConfigLoader.validate(config)).toThrow(
        'Either GitHub or GitLab token is required'
      );
    });

    it('should pass validation with valid OpenAI config', () => {
      const config = {
        aiProvider: 'openai' as const,
        openai: {
          apiKey: 'test-key',
          model: 'gpt-4',
        },
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
        globalRules: [],
      };

      expect(() => ConfigLoader.validate(config)).not.toThrow();
    });

    it('should pass validation with valid Claude config', () => {
      const config = {
        aiProvider: 'claude' as const,
        claude: {
          apiKey: 'test-key',
          model: 'claude-3-sonnet',
        },
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
        gitlab: {
          token: 'test-token',
          projectId: 'project-123',
        },
        globalRules: [],
      };

      expect(() => ConfigLoader.validate(config)).not.toThrow();
    });
  });
});
