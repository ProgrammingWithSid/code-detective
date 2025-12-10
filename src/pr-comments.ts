import { Octokit } from '@octokit/rest';
import {
  Config,
  GitLabMergeRequest,
  PRCommentError,
  ReviewComment,
  ReviewResult,
  Severity,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const SEVERITY_EMOJI: Record<Severity, string> = {
  error: '🔴',
  warning: '🟡',
  info: 'ℹ️',
  suggestion: '💡',
};

// ============================================================================
// Interfaces
// ============================================================================

export interface PRCommentService {
  postComments(comments: ReviewComment[], prNumber: number): Promise<void>;
  postReviewSummary(summary: ReviewResult, prNumber: number): Promise<void>;
}

interface GitHubPRFile {
  filename: string;
  sha: string;
}

interface GitHubReviewComment {
  path: string;
  line: number;
  body: string;
}

// ============================================================================
// GitHub Comment Service
// ============================================================================

export class GitHubCommentService implements PRCommentService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: Config) {
    if (!config.github?.token) {
      throw new PRCommentError('GitHub token is required');
    }
    if (!config.repository) {
      throw new PRCommentError('Repository configuration is required');
    }

    this.octokit = new Octokit({ auth: config.github.token });
    this.owner = config.repository.owner;
    this.repo = config.repository.repo;
  }

  async postComments(comments: ReviewComment[], prNumber: number): Promise<void> {
    const commentsByFile = this.groupCommentsByFile(comments);

    for (const [file, fileComments] of commentsByFile.entries()) {
      await this.postFileComments(file, fileComments, prNumber);
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to post review summary: ${errorMessage}`);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private groupCommentsByFile(comments: ReviewComment[]): Map<string, ReviewComment[]> {
    const commentsByFile = new Map<string, ReviewComment[]>();

    for (const comment of comments) {
      const existing = commentsByFile.get(comment.file) ?? [];
      existing.push(comment);
      commentsByFile.set(comment.file, existing);
    }

    return commentsByFile;
  }

  private async postFileComments(
    file: string,
    comments: ReviewComment[],
    prNumber: number
  ): Promise<void> {
    try {
      const prFiles = await this.getPRFiles(prNumber);
      const prFile = prFiles.find((f) => f.filename === file);

      if (!prFile) {
        console.warn(`File ${file} not found in PR files`);
        return;
      }

      const reviewComments = this.formatReviewComments(comments);

      await this.octokit.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        commit_id: prFile.sha,
        body: `Found ${comments.length} issue(s) in ${file}`,
        event: 'COMMENT',
        comments: reviewComments,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to post comments for ${file}: ${errorMessage}`);
    }
  }

  private async getPRFiles(prNumber: number): Promise<GitHubPRFile[]> {
    const { data: prFiles } = await this.octokit.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });

    return prFiles.map((f) => ({
      filename: f.filename,
      sha: f.sha,
    }));
  }

  private formatReviewComments(comments: ReviewComment[]): GitHubReviewComment[] {
    return comments.map((comment) => ({
      path: comment.file,
      line: comment.line,
      body: this.formatComment(comment),
    }));
  }

  private formatComment(comment: ReviewComment): string {
    const emoji = SEVERITY_EMOJI[comment.severity];
    let body = `${emoji} **${comment.severity.toUpperCase()}**`;

    if (comment.category || comment.rule) {
      body += ` | \`${comment.category || comment.rule}\``;
    }

    body += `\n\n${comment.body}`;

    if (comment.fix) {
      body += `\n\n💡 **Suggested Fix:**\n\`\`\`suggestion\n${comment.fix}\n\`\`\``;
    }

    return body;
  }

  private formatSummary(summary: ReviewResult): string {
    let body = '## 🔍 Code Review Summary\n\n';
    body += `${summary.summary}\n\n`;
    body += '### Statistics\n\n';
    body += `| Category | Count |\n`;
    body += `|----------|-------|\n`;
    body += `| 🔴 Errors | ${summary.stats.errors} |\n`;
    body += `| 🟡 Warnings | ${summary.stats.warnings} |\n`;
    body += `| 💡 Suggestions | ${summary.stats.suggestions} |\n`;

    return body;
  }
}

// ============================================================================
// GitLab Comment Service
// ============================================================================

export class GitLabCommentService implements PRCommentService {
  private token: string;
  private projectId: string;
  private baseUrl: string;

  constructor(config: Config, baseUrl: string = 'https://gitlab.com/api/v4') {
    if (!config.gitlab?.token) {
      throw new PRCommentError('GitLab token is required');
    }
    if (!config.gitlab?.projectId) {
      throw new PRCommentError('GitLab project ID is required');
    }

    this.token = config.gitlab.token;
    this.projectId = config.gitlab.projectId;
    this.baseUrl = baseUrl;
  }

  async postComments(comments: ReviewComment[], prNumber: number): Promise<void> {
    const commentsByFile = this.groupCommentsByFile(comments);
    const mr = await this.getMergeRequest(prNumber);

    for (const [file, fileComments] of commentsByFile.entries()) {
      for (const comment of fileComments) {
        await this.postDiscussion(file, comment, prNumber, mr);
      }
    }
  }

  async postReviewSummary(summary: ReviewResult, prNumber: number): Promise<void> {
    const body = this.formatSummary(summary);

    try {
      await this.postNote(prNumber, body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to post review summary: ${errorMessage}`);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private groupCommentsByFile(comments: ReviewComment[]): Map<string, ReviewComment[]> {
    const commentsByFile = new Map<string, ReviewComment[]>();

    for (const comment of comments) {
      const existing = commentsByFile.get(comment.file) ?? [];
      existing.push(comment);
      commentsByFile.set(comment.file, existing);
    }

    return commentsByFile;
  }

  private async getMergeRequest(prNumber: number): Promise<GitLabMergeRequest> {
    const response = await fetch(
      `${this.baseUrl}/projects/${this.projectId}/merge_requests/${prNumber}`,
      {
        headers: {
          'PRIVATE-TOKEN': this.token,
        },
      }
    );

    if (!response.ok) {
      throw new PRCommentError(`Failed to fetch merge request: ${response.statusText}`);
    }

    return (await response.json()) as GitLabMergeRequest;
  }

  private async postDiscussion(
    file: string,
    comment: ReviewComment,
    prNumber: number,
    mr: GitLabMergeRequest
  ): Promise<void> {
    try {
      await fetch(
        `${this.baseUrl}/projects/${this.projectId}/merge_requests/${prNumber}/discussions`,
        {
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
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to post comment for ${file}:${comment.line}: ${errorMessage}`);
    }
  }

  private async postNote(prNumber: number, body: string): Promise<void> {
    await fetch(`${this.baseUrl}/projects/${this.projectId}/merge_requests/${prNumber}/notes`, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    });
  }

  private formatComment(comment: ReviewComment): string {
    const emoji = SEVERITY_EMOJI[comment.severity];
    let body = `${emoji} **${comment.severity.toUpperCase()}**`;

    if (comment.category || comment.rule) {
      body += ` | \`${comment.category || comment.rule}\``;
    }

    body += `\n\n${comment.body}`;

    if (comment.fix) {
      body += `\n\n💡 **Suggested Fix:**\n\`\`\`suggestion\n${comment.fix}\n\`\`\``;
    }

    return body;
  }

  private formatSummary(summary: ReviewResult): string {
    let body = '## 🔍 Code Review Summary\n\n';
    body += `${summary.summary}\n\n`;
    body += '### Statistics\n\n';
    body += `| Category | Count |\n`;
    body += `|----------|-------|\n`;
    body += `| 🔴 Errors | ${summary.stats.errors} |\n`;
    body += `| 🟡 Warnings | ${summary.stats.warnings} |\n`;
    body += `| 💡 Suggestions | ${summary.stats.suggestions} |\n`;

    return body;
  }
}

// ============================================================================
// Factory
// ============================================================================

export class PRCommentServiceFactory {
  static create(config: Config): PRCommentService {
    if (config.github?.token) {
      return new GitHubCommentService(config);
    }

    if (config.gitlab?.token) {
      return new GitLabCommentService(config);
    }

    throw new PRCommentError('Either GitHub or GitLab token is required');
  }
}
