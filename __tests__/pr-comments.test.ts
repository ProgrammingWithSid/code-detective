import { GitHubCommentService, GitLabCommentService, PRCommentServiceFactory } from '../src/pr-comments';
import { Config, ReviewComment, ReviewResult } from '../src/types';
import { Octokit } from '@octokit/rest';

jest.mock('@octokit/rest');

describe('PRCommentService', () => {
  describe('GitHubCommentService', () => {
    let service: GitHubCommentService;
    let mockOctokit: jest.Mocked<Octokit>;
    let config: Config;

    beforeEach(() => {
      jest.clearAllMocks();

      config = {
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
      };

      mockOctokit = {
        pulls: {
          listFiles: jest.fn().mockResolvedValue({ data: [] }),
          createReview: jest.fn().mockResolvedValue({}),
        },
        issues: {
          createComment: jest.fn().mockResolvedValue({}),
        },
      } as any;

      (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(() => mockOctokit);

      service = new GitHubCommentService(config);
    });

    it('should post comments grouped by file', async () => {
      const comments: ReviewComment[] = [
        {
          file: 'src/file1.ts',
          line: 10,
          body: 'Issue 1',
          severity: 'error',
        },
        {
          file: 'src/file1.ts',
          line: 15,
          body: 'Issue 2',
          severity: 'warning',
        },
        {
          file: 'src/file2.ts',
          line: 5,
          body: 'Issue 3',
          severity: 'info',
        },
      ];

      const mockListFiles = jest.fn().mockResolvedValue({
        data: [
          { filename: 'src/file1.ts', sha: 'sha1' },
          { filename: 'src/file2.ts', sha: 'sha2' },
        ],
      });
      const mockCreateReview = jest.fn().mockResolvedValue({});

      mockOctokit.pulls.listFiles = mockListFiles as any;
      mockOctokit.pulls.createReview = mockCreateReview as any;

      await service.postComments(comments, 123);

      expect(mockCreateReview).toHaveBeenCalledTimes(2);
      expect(mockCreateReview).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        pull_number: 123,
        commit_id: 'sha1',
        body: expect.stringContaining('src/file1.ts'),
        event: 'COMMENT',
        comments: expect.arrayContaining([
          expect.objectContaining({ path: 'src/file1.ts', line: 10 }),
          expect.objectContaining({ path: 'src/file1.ts', line: 15 }),
        ]),
      });
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

      const mockListFiles = jest.fn().mockResolvedValue({
        data: [{ filename: 'src/file.ts', sha: 'sha1' }],
      });
      const mockCreateReview = jest.fn().mockResolvedValue({});

      mockOctokit.pulls.listFiles = mockListFiles as any;
      mockOctokit.pulls.createReview = mockCreateReview as any;

      await service.postComments(comments, 123);

      const reviewCall = mockCreateReview.mock.calls[0][0];
      const commentBody = reviewCall.comments[0].body;

      expect(commentBody).toContain('🔴');
      expect(commentBody).toContain('ERROR');
      expect(commentBody).toContain('Error message');
      expect(commentBody).toContain('security-rule');
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

      const mockCreateComment = jest.fn().mockResolvedValue({});
      mockOctokit.issues.createComment = mockCreateComment as any;

      await service.postReviewSummary(summary, 123);

      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('Review completed'),
      });

      const commentBody = mockCreateComment.mock.calls[0][0].body;
      expect(commentBody).toContain('Errors: 2');
      expect(commentBody).toContain('Warnings: 3');
      expect(commentBody).toContain('Suggestions: 1');
    });

    it('should skip comments for files not in PR', async () => {
      const comments: ReviewComment[] = [
        {
          file: 'src/missing.ts',
          line: 10,
          body: 'Issue',
          severity: 'error',
        },
      ];

      const mockListFiles = jest.fn().mockResolvedValue({
        data: [{ filename: 'src/file.ts', sha: 'sha1' }],
      });
      const mockCreateReview = jest.fn();

      mockOctokit.pulls.listFiles = mockListFiles as any;
      mockOctokit.pulls.createReview = mockCreateReview as any;

      await service.postComments(comments, 123);

      expect(mockCreateReview).not.toHaveBeenCalled();
    });
  });

  describe('GitLabCommentService', () => {
    let service: GitLabCommentService;
    let config: Config;
    let mockFetch: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      config = {
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
        gitlab: {
          token: 'test-token',
          projectId: '456',
        },
      };

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

    it('should post comments to GitLab', async () => {
      const comments: ReviewComment[] = [
        {
          file: 'src/file.ts',
          line: 10,
          body: 'Issue',
          severity: 'error',
        },
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

    it('should post review summary to GitLab', async () => {
      const summary: ReviewResult = {
        summary: 'Review completed',
        comments: [],
        stats: {
          errors: 1,
          warnings: 2,
          suggestions: 3,
        },
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
  });

  describe('PRCommentServiceFactory', () => {
    it('should create GitHub service when GitHub token is provided', () => {
      const config: Config = {
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
      };

      const service = PRCommentServiceFactory.create(config);

      expect(service).toBeInstanceOf(GitHubCommentService);
    });

    it('should create GitLab service when GitLab token is provided', () => {
      const config: Config = {
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
        gitlab: {
          token: 'test-token',
          projectId: '456',
        },
      };

      const service = PRCommentServiceFactory.create(config);

      expect(service).toBeInstanceOf(GitLabCommentService);
    });

    it('should throw error if neither token is provided', () => {
      const config = {
        aiProvider: 'openai',
        repository: {
          owner: 'test-org',
          repo: 'test-repo',
          baseBranch: 'main',
        },
        pr: {
          number: 123,
        },
      } as any;

      expect(() => PRCommentServiceFactory.create(config)).toThrow();
    });
  });
});
