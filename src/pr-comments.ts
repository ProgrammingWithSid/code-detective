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
  additions?: number;
  deletions?: number;
  changes?: number;
  patch?: string;
}

interface GitHubReviewComment {
  path: string;
  line: number;
  body: string;
}

interface CommentCategory {
  actionable: ReviewComment[];
  outsideDiff: ReviewComment[];
  nitpicks: ReviewComment[];
  cautions: ReviewComment[];
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
    if (comments.length === 0) {
      return;
    }

    // Get PR files to determine diff ranges
    const prFiles = await this.getPRFiles(prNumber);
    const prFilesMap = new Map(prFiles.map((f) => [f.filename, f]));

    // Categorize comments
    const categorized = this.categorizeComments(comments, prFilesMap);

    // Post inline comments for actionable comments within diff range
    await this.postInlineComments(categorized.actionable, prNumber, prFilesMap);

    // Post summary comment with categorized sections
    await this.postSummaryComment(categorized, prNumber);
  }

  async postReviewSummary(summary: ReviewResult, prNumber: number): Promise<void> {
    const body = this.formatReviewSummary(summary);

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

  private async getPRFiles(prNumber: number): Promise<GitHubPRFile[]> {
    const { data: prFiles } = await this.octokit.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });

    return prFiles.map(
      (f): GitHubPRFile => ({
        filename: f.filename,
        sha: f.sha,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch ?? undefined,
      })
    );
  }

  private categorizeComments(
    comments: ReviewComment[],
    prFilesMap: Map<string, GitHubPRFile>
  ): CommentCategory {
    const actionable: ReviewComment[] = [];
    const outsideDiff: ReviewComment[] = [];
    const nitpicks: ReviewComment[] = [];
    const cautions: ReviewComment[] = [];

    for (const comment of comments) {
      const prFile = prFilesMap.get(comment.file);
      const isInDiff = this.isCommentInDiff(comment, prFile);

      if (isInDiff) {
        // Only comments inside diff are posted inline
        actionable.push(comment);
      } else {
        // Comments outside diff go to summary sections
        outsideDiff.push(comment);

        // Categorize outside diff comments by severity
        if (comment.severity === 'info' || comment.severity === 'suggestion') {
          nitpicks.push(comment);
        } else if (comment.severity === 'error' || comment.severity === 'warning') {
          cautions.push(comment);
        }
      }
    }

    return { actionable, outsideDiff, nitpicks, cautions };
  }

  private isCommentInDiff(comment: ReviewComment, prFile?: GitHubPRFile): boolean {
    if (!prFile || !prFile.patch) {
      return false;
    }

    // Parse patch to get line ranges
    const patchLines = prFile.patch.split('\n');
    let currentLine = 0;

    for (const line of patchLines) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@\s*-\d+(?:,\d+)?\s*\+(\d+)(?:,(\d+))?/);
        if (match?.[1]) {
          currentLine = parseInt(match[1], 10);
        }
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        if (currentLine === comment.line) {
          return true;
        }
        currentLine++;
      } else if (line.startsWith(' ') || line.startsWith('-')) {
        if (!line.startsWith('---') && !line.startsWith('+++')) {
          if (line.startsWith(' ')) {
            currentLine++;
          }
        }
      }
    }

    return false;
  }

  private async postInlineComments(
    comments: ReviewComment[],
    prNumber: number,
    prFilesMap: Map<string, GitHubPRFile>
  ): Promise<void> {
    if (comments.length === 0) {
      return;
    }

    const commentsByFile = this.groupCommentsByFile(comments);

    for (const [file, fileComments] of commentsByFile.entries()) {
      const prFile = prFilesMap.get(file);
      if (!prFile) {
        continue;
      }

      const reviewComments = this.formatReviewComments(fileComments);

      try {
        await this.octokit.pulls.createReview({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          commit_id: prFile.sha,
          body: '',
          event: 'COMMENT',
          comments: reviewComments,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to post inline comments for ${file}: ${errorMessage}`);
      }
    }
  }

  private async postSummaryComment(categorized: CommentCategory, prNumber: number): Promise<void> {
    const actionableCount = categorized.actionable.length;
    const outsideDiffCount = categorized.outsideDiff.length;
    const nitpickCount = categorized.nitpicks.length;

    let body = `**Actionable comments posted: ${actionableCount}**\n\n`;

    // Caution section - only show if there are comments outside diff
    if (outsideDiffCount > 0) {
      body += `> ⚠️ **Caution**\n`;
      body += `> Some comments are outside the diff and can't be posted inline due to platform limitations.\n\n`;
    }

    // Outside diff range comments
    if (outsideDiffCount > 0) {
      body += `<details>\n`;
      body += `<summary>⚠️ Outside diff range comments (${outsideDiffCount})</summary>\n\n`;
      body += this.formatCommentsList(categorized.outsideDiff);
      body += `</details>\n\n`;
    }

    // Nitpick comments (only those outside diff)
    if (nitpickCount > 0) {
      body += `<details>\n`;
      body += `<summary>🧹 Nitpick comments (${nitpickCount})</summary>\n\n`;
      body += this.formatCommentsList(categorized.nitpicks);
      body += `</details>\n\n`;
    }

    // Review details
    body += `<details>\n`;
    body += `<summary>📄 Review details</summary>\n\n`;
    body += `- **Total comments:** ${categorized.actionable.length + categorized.outsideDiff.length}\n`;
    body += `- **Inline comments:** ${categorized.actionable.length}\n`;
    body += `- **Outside diff:** ${outsideDiffCount}\n`;
    body += `- **Errors/Warnings:** ${categorized.cautions.length}\n`;
    body += `- **Suggestions:** ${nitpickCount}\n`;
    body += `</details>\n`;

    try {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        body,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to post summary comment: ${errorMessage}`);
    }
  }

  private formatCommentsList(comments: ReviewComment[]): string {
    const commentsByFile = this.groupCommentsByFile(comments);
    let result = '';

    for (const [file, fileComments] of commentsByFile.entries()) {
      result += `**\`${file}\`**\n\n`;
      for (const comment of fileComments) {
        result += `- **Line ${comment.line}:** ${this.formatCommentInline(comment)}\n`;
      }
      result += '\n';
    }

    return result;
  }

  private formatCommentInline(comment: ReviewComment): string {
    const emoji = SEVERITY_EMOJI[comment.severity];
    let text = `${emoji} ${comment.body}`;

    if (comment.category || comment.rule) {
      text += ` \`${comment.category || comment.rule}\``;
    }

    return text;
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

  private formatReviewSummary(summary: ReviewResult): string {
    let body = '## 🔍 Code Review Summary\n\n';
    body += `${summary.summary}\n\n`;

    if (summary.topIssues && summary.topIssues.length > 0) {
      body += '### Top Issues\n\n';
      for (const issue of summary.topIssues) {
        body += `- ${issue}\n`;
      }
      body += '\n';
    }

    body += '### Statistics\n\n';
    body += `| Category | Count |\n`;
    body += `|----------|-------|\n`;
    body += `| 🔴 Errors | ${summary.stats.errors} |\n`;
    body += `| 🟡 Warnings | ${summary.stats.warnings} |\n`;
    body += `| 💡 Suggestions | ${summary.stats.suggestions} |\n`;

    if (summary.recommendation) {
      body += `\n**Recommendation:** ${summary.recommendation}\n`;
    }

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
    const body = this.formatReviewSummary(summary);

    try {
      await this.postNote(prNumber, body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to post review summary: ${errorMessage}`);
    }
  }

  private formatReviewSummary(summary: ReviewResult): string {
    let body = '## 🔍 Code Review Summary\n\n';
    body += `${summary.summary}\n\n`;

    if (summary.topIssues && summary.topIssues.length > 0) {
      body += '### Top Issues\n\n';
      for (const issue of summary.topIssues) {
        body += `- ${issue}\n`;
      }
      body += '\n';
    }

    body += '### Statistics\n\n';
    body += `| Category | Count |\n`;
    body += `|----------|-------|\n`;
    body += `| 🔴 Errors | ${summary.stats.errors} |\n`;
    body += `| 🟡 Warnings | ${summary.stats.warnings} |\n`;
    body += `| 💡 Suggestions | ${summary.stats.suggestions} |\n`;

    if (summary.recommendation) {
      body += `\n**Recommendation:** ${summary.recommendation}\n`;
    }

    return body;
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
