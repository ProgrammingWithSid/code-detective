import { Octokit } from '@octokit/rest';
import {
  GitHubCommentService,
  GitLabCommentService,
  PRCommentServiceFactory,
} from '../src/pr-comments';
import { Config, PRCommentError, ReviewComment, ReviewResult } from '../src/types';

jest.mock('@octokit/rest');

describe('PRCommentService', () => {
  const createConfig = (overrides: Partial<Config> = {}): Config => ({
    aiProvider: 'openai',
    openai: {
      apiKey: 'test-key',
      model: 'gpt-4',
    },
    globalRules: [],
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
    ...overrides,
  });

  describe('GitHubCommentService', () => {
    let service: GitHubCommentService;
    let mockOctokit: {
      pulls: {
        listFiles: jest.Mock;
        createReview: jest.Mock;
        get: jest.Mock;
      };
      issues: {
        createComment: jest.Mock;
      };
    };
    let config: Config;

    beforeEach(() => {
      jest.clearAllMocks();

      config = createConfig();

      mockOctokit = {
        pulls: {
          listFiles: jest.fn().mockResolvedValue({ data: [] }),
          createReview: jest.fn().mockResolvedValue({}),
          get: jest.fn().mockResolvedValue({ data: { head: { sha: 'test-head-sha' } } }),
        },
        issues: {
          createComment: jest.fn().mockResolvedValue({}),
        },
      };

      (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(
        () => mockOctokit as unknown as Octokit
      );

      service = new GitHubCommentService(config);
    });

    it('should throw error if GitHub token is missing', () => {
      const invalidConfig = createConfig({ github: undefined });
      expect(() => new GitHubCommentService(invalidConfig)).toThrow(PRCommentError);
    });

    it('should throw error if repository config is missing', () => {
      const invalidConfig = {
        ...createConfig(),
        repository: undefined,
      } as unknown as Config;
      expect(() => new GitHubCommentService(invalidConfig)).toThrow(PRCommentError);
    });

    it('should post comments grouped by file', async () => {
      const comments: ReviewComment[] = [
        { file: 'src/file1.ts', line: 10, body: 'Issue 1', severity: 'error' },
        { file: 'src/file1.ts', line: 15, body: 'Issue 2', severity: 'warning' },
        { file: 'src/file2.ts', line: 5, body: 'Issue 3', severity: 'info' },
      ];

      // Mock PR files with patch data to make comments actionable (in diff)
      mockOctokit.pulls.listFiles.mockResolvedValue({
        data: [
          {
            filename: 'src/file1.ts',
            sha: 'sha1',
            patch: '@@ -8,0 +10,2 @@\n+line 10\n+line 15',
          },
          {
            filename: 'src/file2.ts',
            sha: 'sha2',
            patch: '@@ -3,0 +5,1 @@\n+line 5',
          },
        ],
      });

      await service.postComments(comments, 123);

      // Should post inline comments for actionable comments (2 files)
      expect(mockOctokit.pulls.get).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        pull_number: 123,
      });
      expect(mockOctokit.pulls.createReview).toHaveBeenCalledTimes(2);
      expect(mockOctokit.pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-org',
          repo: 'test-repo',
          pull_number: 123,
          commit_id: 'test-head-sha',
          event: 'COMMENT',
        })
      );
      // Should also post summary comment
      expect(mockOctokit.issues.createComment).toHaveBeenCalledTimes(1);
    });

    it('should format comments with severity emoji', async () => {
      const comments: ReviewComment[] = [
        {
          file: 'src/file.ts',
          line: 10,
          body: 'Error message',
          severity: 'error',
          rule: 'security-rule',
        },
      ];

      // Mock PR file with patch to make comment actionable (in diff)
      mockOctokit.pulls.listFiles.mockResolvedValue({
        data: [
          {
            filename: 'src/file.ts',
            sha: 'sha1',
            patch: '@@ -8,0 +10,1 @@\n+line 10',
          },
        ],
      });

      await service.postComments(comments, 123);

      // Check inline comment formatting
      expect(mockOctokit.pulls.createReview).toHaveBeenCalledTimes(1);
      const reviewCall = mockOctokit.pulls.createReview.mock.calls[0][0] as {
        comments: Array<{ body: string }>;
      };
      const commentBody = reviewCall.comments[0].body;

      expect(commentBody).toContain('🔴');
      expect(commentBody).toContain('ERROR');
      expect(commentBody).toContain('Error message');
      expect(commentBody).toContain('security-rule');
    });

    it('should format comments for all severity levels', async () => {
      const severities: ReviewComment['severity'][] = ['error', 'warning', 'info', 'suggestion'];
      const expectedEmojis = ['🔴', '🟡', 'ℹ️', '💡'];

      for (let i = 0; i < severities.length; i++) {
        jest.clearAllMocks();
        service = new GitHubCommentService(config);

        const comments: ReviewComment[] = [
          { file: 'src/file.ts', line: 10, body: 'Message', severity: severities[i] },
        ];

        // Mock PR file with patch to make comment actionable (in diff)
        mockOctokit.pulls.listFiles.mockResolvedValue({
          data: [
            {
              filename: 'src/file.ts',
              sha: 'sha1',
              patch: '@@ -8,0 +10,1 @@\n+line 10',
            },
          ],
        });

        await service.postComments(comments, 123);

        // Check inline comment formatting
        expect(mockOctokit.pulls.createReview).toHaveBeenCalledTimes(1);
        const reviewCall = mockOctokit.pulls.createReview.mock.calls[0][0] as {
          comments: Array<{ body: string }>;
        };
        expect(reviewCall.comments[0].body).toContain(expectedEmojis[i]);
      }
    });

    it('should post review summary', async () => {
      const summary: ReviewResult = {
        summary: 'Review completed',
        comments: [],
        stats: {
          errors: 2,
          warnings: 3,
          suggestions: 1,
        },
      };

      await service.postReviewSummary(summary, 123);

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('Review completed'),
      });

      const commentBody = mockOctokit.issues.createComment.mock.calls[0][0].body as string;
      expect(commentBody).toContain('🔴 Errors | 2');
      expect(commentBody).toContain('🟡 Warnings | 3');
      expect(commentBody).toContain('💡 Suggestions | 1');
    });

    it('should skip comments for files not in PR', async () => {
      const comments: ReviewComment[] = [
        { file: 'src/missing.ts', line: 10, body: 'Issue', severity: 'error' },
      ];

      mockOctokit.pulls.listFiles.mockResolvedValue({
        data: [{ filename: 'src/file.ts', sha: 'sha1' }],
      });

      await service.postComments(comments, 123);

      expect(mockOctokit.pulls.createReview).not.toHaveBeenCalled();
    });

    it('should handle errors when posting comments', async () => {
      const comments: ReviewComment[] = [
        { file: 'src/file.ts', line: 10, body: 'Issue', severity: 'error' },
      ];

      mockOctokit.pulls.listFiles.mockResolvedValue({
        data: [{ filename: 'src/file.ts', sha: 'sha1' }],
      });
      mockOctokit.pulls.createReview.mockRejectedValue(new Error('API error'));

      // Should not throw, just log error
      await expect(service.postComments(comments, 123)).resolves.not.toThrow();
    });

    it('should handle errors when posting summary', async () => {
      const summary: ReviewResult = {
        summary: 'Review completed',
        comments: [],
        stats: { errors: 0, warnings: 0, suggestions: 0 },
      };

      mockOctokit.issues.createComment.mockRejectedValue(new Error('API error'));

      // Should not throw, just log error
      await expect(service.postReviewSummary(summary, 123)).resolves.not.toThrow();
    });
  });

  describe('GitLabCommentService', () => {
    let service: GitLabCommentService;
    let config: Config;
    let mockFetch: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      config = createConfig({
        github: undefined,
        gitlab: {
          token: 'test-token',
          projectId: '456',
        },
      });

      mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          diff_refs: {
            base_sha: 'base-sha',
            start_sha: 'start-sha',
            head_sha: 'head-sha',
          },
        }),
      });

      global.fetch = mockFetch;

      service = new GitLabCommentService(config);
    });

    it('should throw error if GitLab token is missing', () => {
      const invalidConfig = createConfig({ gitlab: undefined, github: undefined });
      expect(() => new GitLabCommentService(invalidConfig)).toThrow(PRCommentError);
    });

    it('should throw error if GitLab project ID is missing', () => {
      const invalidConfig = createConfig({
        gitlab: { token: 'test-token', projectId: '' },
        github: undefined,
      });
      expect(() => new GitLabCommentService(invalidConfig)).toThrow(PRCommentError);
    });

    it('should post comments to GitLab', async () => {
      const comments: ReviewComment[] = [
        { file: 'src/file.ts', line: 10, body: 'Issue', severity: 'error' },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            diff_refs: {
              base_sha: 'base-sha',
              start_sha: 'start-sha',
              head_sha: 'head-sha',
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({}),
        });

      await service.postComments(comments, 123);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const discussionCall = mockFetch.mock.calls[1];
      expect(discussionCall[0]).toContain('/merge_requests/123/discussions');
      expect(discussionCall[1].headers['PRIVATE-TOKEN']).toBe('test-token');
    });

    it('should throw error when MR fetch fails', async () => {
      const comments: ReviewComment[] = [
        { file: 'src/file.ts', line: 10, body: 'Issue', severity: 'error' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(service.postComments(comments, 123)).rejects.toThrow(PRCommentError);
    });

    it('should post review summary to GitLab', async () => {
      const summary: ReviewResult = {
        summary: 'Review completed',
        comments: [],
        stats: { errors: 1, warnings: 2, suggestions: 3 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      });

      await service.postReviewSummary(summary, 123);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/merge_requests/123/notes'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'PRIVATE-TOKEN': 'test-token',
          }),
        })
      );
    });

    it('should use custom base URL', () => {
      const customService = new GitLabCommentService(config, 'https://custom.gitlab.com/api/v4');
      expect(customService).toBeInstanceOf(GitLabCommentService);
    });
  });

  describe('PRCommentServiceFactory', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(
        () =>
          ({
            pulls: { listFiles: jest.fn(), createReview: jest.fn() },
            issues: { createComment: jest.fn() },
          }) as unknown as Octokit
      );
    });

    it('should create GitHub service when GitHub token is provided', () => {
      const config = createConfig();
      const service = PRCommentServiceFactory.create(config);
      expect(service).toBeInstanceOf(GitHubCommentService);
    });

    it('should create GitLab service when GitLab token is provided', () => {
      const config = createConfig({
        github: undefined,
        gitlab: {
          token: 'test-token',
          projectId: '456',
        },
      });

      const service = PRCommentServiceFactory.create(config);
      expect(service).toBeInstanceOf(GitLabCommentService);
    });

    it('should prefer GitHub over GitLab when both are provided', () => {
      const config = createConfig({
        gitlab: {
          token: 'gitlab-token',
          projectId: '456',
        },
      });

      const service = PRCommentServiceFactory.create(config);
      expect(service).toBeInstanceOf(GitHubCommentService);
    });

    it('should throw error if neither token is provided', () => {
      const config = createConfig({ github: undefined });
      expect(() => PRCommentServiceFactory.create(config)).toThrow(PRCommentError);
    });
  });
});
