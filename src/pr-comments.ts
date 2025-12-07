import { Octokit } from '@octokit/rest';
import { ReviewComment, ReviewResult } from './types';
import { Config } from './types';

export interface PRCommentService {
  postComments(comments: ReviewComment[], prNumber: number): Promise<void>;
  postReviewSummary(summary: ReviewResult, prNumber: number): Promise<void>;
}

export class GitHubCommentService implements PRCommentService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: Config) {
    if (!config.github?.token) {
      throw new Error('GitHub token is required');
    }
    if (!config.repository) {
      throw new Error('Repository configuration is required');
    }

    this.octokit = new Octokit({ auth: config.github.token });
    this.owner = config.repository.owner;
    this.repo = config.repository.repo;
  }

  async postComments(comments: ReviewComment[], prNumber: number): Promise<void> {
    // Group comments by file
    const commentsByFile = new Map<string, ReviewComment[]>();

    for (const comment of comments) {
      if (!commentsByFile.has(comment.file)) {
        commentsByFile.set(comment.file, []);
      }
      commentsByFile.get(comment.file)!.push(comment);
    }

    // Post comments for each file
    for (const [file, fileComments] of commentsByFile.entries()) {
      try {
        // Get PR files to find the SHA
        const { data: prFiles } = await this.octokit.pulls.listFiles({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
        });

        const prFile = prFiles.find(f => f.filename === file);
        if (!prFile) {
          console.warn(`File ${file} not found in PR files`);
          continue;
        }

        // Post review comments
        const reviewComments = fileComments.map(comment => ({
          path: comment.file,
          line: comment.line,
          body: this.formatComment(comment),
        }));

        // Create a review with comments
        await this.octokit.pulls.createReview({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          commit_id: prFile.sha,
          body: `Found ${fileComments.length} issue(s) in ${file}`,
          event: 'COMMENT',
          comments: reviewComments,
        });
      } catch (error: any) {
        console.error(`Failed to post comments for ${file}:`, error.message);
      }
    }
  }

  async postReviewSummary(summary: ReviewResult, prNumber: number): Promise<void> {
    const body = this.formatSummary(summary);

    try {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        body,
      });
    } catch (error: any) {
      console.error(`Failed to post review summary:`, error.message);
    }
  }

  private formatComment(comment: ReviewComment): string {
    const severityEmoji = {
      error: '🔴',
      warning: '🟡',
      info: 'ℹ️',
      suggestion: '💡',
    };

    let body = `${severityEmoji[comment.severity]} **${comment.severity.toUpperCase()}**\n\n`;
    body += `${comment.body}\n\n`;

    if (comment.rule) {
      body += `*Rule: ${comment.rule}*\n`;
    }

    return body;
  }

  private formatSummary(summary: ReviewResult): string {
    let body = '## 🔍 Code Review Summary\n\n';
    body += `${summary.summary}\n\n`;
    body += '### Statistics\n\n';
    body += `- 🔴 Errors: ${summary.stats.errors}\n`;
    body += `- 🟡 Warnings: ${summary.stats.warnings}\n`;
    body += `- 💡 Suggestions: ${summary.stats.suggestions}\n`;

    return body;
  }
}

export class GitLabCommentService implements PRCommentService {
  private token: string;
  private projectId: string;
  private baseUrl: string;

  constructor(config: Config, baseUrl: string = 'https://gitlab.com/api/v4') {
    if (!config.gitlab?.token) {
      throw new Error('GitLab token is required');
    }
    if (!config.gitlab?.projectId) {
      throw new Error('GitLab project ID is required');
    }

    this.token = config.gitlab.token;
    this.projectId = config.gitlab.projectId;
    this.baseUrl = baseUrl;
  }

  async postComments(comments: ReviewComment[], prNumber: number): Promise<void> {
    // Group comments by file
    const commentsByFile = new Map<string, ReviewComment[]>();

    for (const comment of comments) {
      if (!commentsByFile.has(comment.file)) {
        commentsByFile.set(comment.file, []);
      }
      commentsByFile.get(comment.file)!.push(comment);
    }

    // Get merge request details
    const mrResponse = await fetch(`${this.baseUrl}/projects/${this.projectId}/merge_requests/${prNumber}`, {
      headers: {
        'PRIVATE-TOKEN': this.token,
      },
    });

    if (!mrResponse.ok) {
      throw new Error(`Failed to fetch merge request: ${mrResponse.statusText}`);
    }

    const mr = await mrResponse.json() as {
      diff_refs: {
        base_sha: string;
        start_sha: string;
        head_sha: string;
      };
    };

    // Post comments for each file
    for (const [file, fileComments] of commentsByFile.entries()) {
      for (const comment of fileComments) {
        try {
          await fetch(`${this.baseUrl}/projects/${this.projectId}/merge_requests/${prNumber}/discussions`, {
            method: 'POST',
            headers: {
              'PRIVATE-TOKEN': this.token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              body: this.formatComment(comment),
              position: {
                base_sha: mr.diff_refs.base_sha,
                start_sha: mr.diff_refs.start_sha,
                head_sha: mr.diff_refs.head_sha,
                old_path: file,
                new_path: file,
                new_line: comment.line,
              },
            }),
          });
        } catch (error: any) {
          console.error(`Failed to post comment for ${file}:${comment.line}:`, error.message);
        }
      }
    }
  }

  async postReviewSummary(summary: ReviewResult, prNumber: number): Promise<void> {
    const body = this.formatSummary(summary);

    try {
      await fetch(`${this.baseUrl}/projects/${this.projectId}/merge_requests/${prNumber}/notes`, {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body,
        }),
      });
    } catch (error: any) {
      console.error(`Failed to post review summary:`, error.message);
    }
  }

  private formatComment(comment: ReviewComment): string {
    const severityEmoji = {
      error: '🔴',
      warning: '🟡',
      info: 'ℹ️',
      suggestion: '💡',
    };

    let body = `${severityEmoji[comment.severity]} **${comment.severity.toUpperCase()}**\n\n`;
    body += `${comment.body}\n\n`;

    if (comment.rule) {
      body += `*Rule: ${comment.rule}*\n`;
    }

    return body;
  }

  private formatSummary(summary: ReviewResult): string {
    let body = '## 🔍 Code Review Summary\n\n';
    body += `${summary.summary}\n\n`;
    body += '### Statistics\n\n';
    body += `- 🔴 Errors: ${summary.stats.errors}\n`;
    body += `- 🟡 Warnings: ${summary.stats.warnings}\n`;
    body += `- 💡 Suggestions: ${summary.stats.suggestions}\n`;

    return body;
  }
}

export class PRCommentServiceFactory {
  static create(config: Config): PRCommentService {
    if (config.github?.token) {
      return new GitHubCommentService(config);
    } else if (config.gitlab?.token) {
      return new GitLabCommentService(config);
    } else {
      throw new Error('Either GitHub or GitLab token is required');
    }
  }
}
