import {
  AIProviderError,
  AIProviderSchema,
  CodeSherlockError,
  ConfigSchema,
  ConfigurationError,
  GitError,
  PRCommentError,
  isAIIssue,
  isAIReviewResponse,
} from '../src/types';

describe('Types', () => {
  describe('AIProviderSchema', () => {
    it('should accept valid providers', () => {
      expect(AIProviderSchema.parse('openai')).toBe('openai');
      expect(AIProviderSchema.parse('claude')).toBe('claude');
    });

    it('should reject invalid providers', () => {
      expect(() => AIProviderSchema.parse('invalid')).toThrow();
      expect(() => AIProviderSchema.parse('')).toThrow();
      expect(() => AIProviderSchema.parse(123)).toThrow();
    });
  });

  describe('ConfigSchema', () => {
    const validConfig = {
      aiProvider: 'openai',
      openai: {
        apiKey: 'test-key',
        model: 'gpt-4',
      },
      globalRules: ['rule1'],
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

    it('should accept valid config', () => {
      const result = ConfigSchema.parse(validConfig);
      expect(result.aiProvider).toBe('openai');
      expect(result.openai?.apiKey).toBe('test-key');
    });

    it('should apply default values', () => {
      const minimalConfig = {
        aiProvider: 'openai',
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
        },
        pr: {
          number: 123,
        },
      };

      const result = ConfigSchema.parse(minimalConfig);
      expect(result.globalRules).toEqual([]);
      expect(result.repository.baseBranch).toBe('main');
    });

    it('should reject invalid config', () => {
      expect(() => ConfigSchema.parse({})).toThrow();
      expect(() => ConfigSchema.parse({ aiProvider: 'invalid' })).toThrow();
    });

    it('should handle optional fields', () => {
      const configWithoutGithub = {
        aiProvider: 'openai',
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
        },
        pr: {
          number: 123,
        },
      };

      const result = ConfigSchema.parse(configWithoutGithub);
      expect(result.github).toBeUndefined();
      expect(result.gitlab).toBeUndefined();
    });
  });

  describe('Error Classes', () => {
    describe('CodeSherlockError', () => {
      it('should create error with message and code', () => {
        const error = new CodeSherlockError('Test error', 'TEST_CODE');
        expect(error.message).toBe('Test error');
        expect(error.code).toBe('TEST_CODE');
        expect(error.name).toBe('CodeSherlockError');
      });

      it('should include cause when provided', () => {
        const cause = new Error('Original error');
        const error = new CodeSherlockError('Test error', 'TEST_CODE', cause);
        expect(error.cause).toBe(cause);
      });
    });

    describe('ConfigurationError', () => {
      it('should create configuration error', () => {
        const error = new ConfigurationError('Invalid config');
        expect(error.message).toBe('Invalid config');
        expect(error.code).toBe('CONFIG_ERROR');
        expect(error.name).toBe('ConfigurationError');
      });
    });

    describe('GitError', () => {
      it('should create git error', () => {
        const error = new GitError('Git failed');
        expect(error.message).toBe('Git failed');
        expect(error.code).toBe('GIT_ERROR');
        expect(error.name).toBe('GitError');
      });
    });

    describe('AIProviderError', () => {
      it('should create AI provider error', () => {
        const error = new AIProviderError('API failed');
        expect(error.message).toBe('API failed');
        expect(error.code).toBe('AI_PROVIDER_ERROR');
        expect(error.name).toBe('AIProviderError');
      });
    });

    describe('PRCommentError', () => {
      it('should create PR comment error', () => {
        const error = new PRCommentError('Comment failed');
        expect(error.message).toBe('Comment failed');
        expect(error.code).toBe('PR_COMMENT_ERROR');
        expect(error.name).toBe('PRCommentError');
      });
    });
  });

  describe('Type Guards', () => {
    describe('isAIReviewResponse', () => {
      it('should return true for valid response', () => {
        const validResponse = {
          bugs: [],
          security: [],
          performance: [],
          code_quality: [],
          architecture: [],
        };
        expect(isAIReviewResponse(validResponse)).toBe(true);
      });

      it('should return true for partial response', () => {
        expect(isAIReviewResponse({ bugs: [] })).toBe(true);
        expect(isAIReviewResponse({ security: [] })).toBe(true);
      });

      it('should return false for invalid response', () => {
        expect(isAIReviewResponse(null)).toBe(false);
        expect(isAIReviewResponse(undefined)).toBe(false);
        expect(isAIReviewResponse({})).toBe(false);
        expect(isAIReviewResponse({ bugs: 'not an array' })).toBe(false);
      });
    });

    describe('isAIIssue', () => {
      it('should return true for valid issue', () => {
        const validIssue = {
          severity: 'High',
          file: 'test.ts',
          line: 10,
          description: 'Test issue',
        };
        expect(isAIIssue(validIssue)).toBe(true);
      });

      it('should return true for issue with optional fix', () => {
        const issueWithFix = {
          severity: 'Low',
          file: 'test.ts',
          line: 5,
          description: 'Minor issue',
          fix: 'Fix suggestion',
        };
        expect(isAIIssue(issueWithFix)).toBe(true);
      });

      it('should return false for invalid issue', () => {
        expect(isAIIssue(null)).toBe(false);
        expect(isAIIssue(undefined)).toBe(false);
        expect(isAIIssue({})).toBe(false);
        expect(isAIIssue({ severity: 'High' })).toBe(false);
        expect(isAIIssue({ file: 'test.ts', line: 10 })).toBe(false);
      });
    });
  });
});

