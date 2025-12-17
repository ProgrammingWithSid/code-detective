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
  postSuggestions(result: ReviewResult, prNumber: number): Promise<void>;
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
      console.log('No comments to post');
      return;
    }

    console.log(`\n📝 Processing ${comments.length} comment(s) for PR #${prNumber}`);

    // Get PR files to determine diff ranges
    const prFiles = await this.getPRFiles(prNumber);
    console.log(`Found ${prFiles.length} file(s) in PR`);
    const prFilesMap = new Map(prFiles.map((f) => [f.filename, f]));

    // Get PR HEAD commit SHA (needed for inline comments)
    const prHeadSHA = await this.getPRHeadSHA(prNumber);
    console.log(`PR HEAD SHA: ${prHeadSHA}`);

    // Categorize comments
    const categorized = this.categorizeComments(comments, prFilesMap);
    console.log(`\n📊 Comment categorization:`);
    console.log(`  - Actionable (inline): ${categorized.actionable.length}`);
    console.log(`  - Outside diff: ${categorized.outsideDiff.length}`);
    console.log(`  - Nitpicks: ${categorized.nitpicks.length}`);
    console.log(`  - Cautions: ${categorized.cautions.length}`);

    // Post inline comments for actionable comments within diff range
    await this.postInlineComments(categorized.actionable, prNumber, prFilesMap, prHeadSHA);

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

  /**
   * Post suggestions (PR title and naming) as a separate comment
   */
  async postSuggestions(result: ReviewResult, prNumber: number): Promise<void> {
    const hasSuggestions =
      (result.namingSuggestions && result.namingSuggestions.length > 0) || result.prTitleSuggestion;

    if (!hasSuggestions) {
      return;
    }

    let body = '## 💡 Suggestions\n\n';

    // PR Title Suggestion
    if (result.prTitleSuggestion) {
      body += `### 📝 PR Title Suggestion\n\n`;
      if (result.prTitleSuggestion.currentTitle) {
        body += `**Current title:** ${result.prTitleSuggestion.currentTitle}\n\n`;
      }
      body += `**Suggested title:** \`${result.prTitleSuggestion.suggestedTitle}\`\n\n`;
      body += `**Reason:** ${result.prTitleSuggestion.reason}\n\n`;

      if (
        result.prTitleSuggestion.alternatives &&
        result.prTitleSuggestion.alternatives.length > 0
      ) {
        body += `**Alternatives:**\n`;
        for (const alt of result.prTitleSuggestion.alternatives) {
          body += `- \`${alt}\`\n`;
        }
        body += '\n';
      }
    }

    // Naming Suggestions
    if (result.namingSuggestions && result.namingSuggestions.length > 0) {
      body += `### 🏷️ Naming Suggestions (${result.namingSuggestions.length})\n\n`;

      const suggestionsByFile = new Map<string, typeof result.namingSuggestions>();
      for (const suggestion of result.namingSuggestions) {
        const existing = suggestionsByFile.get(suggestion.file) || [];
        existing.push(suggestion);
        suggestionsByFile.set(suggestion.file, existing);
      }

      for (const [file, fileSuggestions] of suggestionsByFile.entries()) {
        body += `**\`${file}\`**\n\n`;
        for (const suggestion of fileSuggestions) {
          const typeEmoji =
            suggestion.type === 'function'
              ? '🔧'
              : suggestion.type === 'class'
                ? '🏛️'
                : suggestion.type === 'variable'
                  ? '📦'
                  : suggestion.type === 'constant'
                    ? '🔒'
                    : '📝';

          body += `- ${typeEmoji} **Line ${suggestion.line}:** `;
          body += `\`${suggestion.currentName}\` → \`${suggestion.suggestedName}\` `;
          body += `(${suggestion.type})\n`;
          body += `  - *${suggestion.reason}*\n\n`;
        }
      }
    }

    try {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        body,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to post suggestions: ${errorMessage}`);
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

  private async getPRHeadSHA(prNumber: number): Promise<string> {
    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });
      return pr.head.sha;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to get PR HEAD SHA: ${errorMessage}`);
      throw new PRCommentError(`Failed to get PR HEAD SHA: ${errorMessage}`);
    }
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

    // Parse patch to get line ranges in the new file
    const patchLines = prFile.patch.split('\n');
    let currentNewLine = 0;

    for (const line of patchLines) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      if (line.startsWith('@@')) {
        const match = line.match(/@@\s*-\d+(?:,\d+)?\s*\+(\d+)(?:,(\d+))?/);
        if (match?.[1]) {
          currentNewLine = parseInt(match[1], 10);
        }
        continue;
      }

      // Skip diff metadata lines
      if (line.startsWith('---') || line.startsWith('+++')) {
        continue;
      }

      // Added line in new file
      if (line.startsWith('+')) {
        if (currentNewLine === comment.line) {
          return true;
        }
        currentNewLine++;
      }
      // Context line (unchanged) - also count towards new file line number
      else if (line.startsWith(' ')) {
        if (currentNewLine === comment.line) {
          // Comment is on a context line - check if it's near changed lines
          // For now, allow context lines as they can have comments too
          return true;
        }
        currentNewLine++;
      }
      // Deleted line (only affects old file, not new file)
      else if (line.startsWith('-')) {
        // Don't increment currentNewLine for deleted lines
        continue;
      }
    }

    return false;
  }

  private async postInlineComments(
    comments: ReviewComment[],
    prNumber: number,
    prFilesMap: Map<string, GitHubPRFile>,
    prHeadSHA: string
  ): Promise<void> {
    if (comments.length === 0) {
      console.log('No actionable comments to post inline');
      return;
    }

    const commentsByFile = this.groupCommentsByFile(comments);
    console.log(`Posting inline comments for ${commentsByFile.size} file(s)`);

    for (const [file, fileComments] of commentsByFile.entries()) {
      const prFile = prFilesMap.get(file);
      if (!prFile) {
        console.warn(`File ${file} not found in PR files, skipping inline comments`);
        continue;
      }

      console.log(`Formatting ${fileComments.length} comment(s) for ${file}`);
      const reviewComments = this.formatReviewComments(fileComments, prFile);
      console.log(`Formatted ${reviewComments.length} review comment(s) for ${file}`);

      if (reviewComments.length === 0) {
        console.warn(`No valid inline comments for ${file} after formatting`);
        continue;
      }

      // Log the comments being posted for debugging
      console.log(`Posting comments to lines: ${reviewComments.map((c) => c.line).join(', ')}`);

      try {
        const response = await this.octokit.pulls.createReview({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          commit_id: prHeadSHA, // Use PR HEAD commit SHA, not file SHA
          body: 'Code review by code-sherlock',
          event: 'COMMENT',
          comments: reviewComments,
        });
        console.log(
          `✅ Successfully posted ${reviewComments.length} inline comment(s) for ${file}`
        );
        console.log(`Review ID: ${response.data.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to post inline comments for ${file}: ${errorMessage}`);
        // Log the error details for debugging
        if (error instanceof Error && 'status' in error) {
          console.error(`Error status: ${(error as { status?: number }).status}`);
        }
        if (error instanceof Error && 'response' in error) {
          const response = (error as { response?: { data?: unknown } }).response;
          console.error(`Error response:`, JSON.stringify(response?.data, null, 2));
        }
        // Don't throw - continue with other files
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

  private formatReviewComments(
    comments: ReviewComment[],
    prFile?: GitHubPRFile
  ): GitHubReviewComment[] {
    if (!prFile || !prFile.patch) {
      console.warn('No patch data available, cannot format review comments');
      return [];
    }

    // Map comment lines to actual diff line numbers
    const validComments: GitHubReviewComment[] = [];

    for (const comment of comments) {
      const mappedLine = this.mapCommentLineToDiffLine(comment.line, prFile);
      if (mappedLine !== null) {
        validComments.push({
          path: comment.file,
          line: mappedLine, // Line number in the new file version within diff
          body: this.formatComment(comment),
        });
      } else {
        console.warn(
          `Comment on line ${comment.line} for ${comment.file} could not be mapped to diff line`
        );
      }
    }

    return validComments;
  }

  /**
   * Map a comment line number to the correct line number in the PR diff
   * Returns null if the line is not in the diff or is a deleted line
   */
  private mapCommentLineToDiffLine(lineNumber: number, prFile: GitHubPRFile): number | null {
    if (!prFile.patch) {
      return null;
    }
    const patchLines = prFile.patch.split('\n');
    let currentNewLine = 0;

    for (const line of patchLines) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      if (line.startsWith('@@')) {
        const match = line.match(/@@\s*-\d+(?:,\d+)?\s*\+(\d+)(?:,(\d+))?/);
        if (match?.[1]) {
          currentNewLine = parseInt(match[1], 10);
        }
        continue;
      }

      // Skip diff metadata lines
      if (line.startsWith('---') || line.startsWith('+++')) {
        continue;
      }

      // Added line in new file - can comment on this
      if (line.startsWith('+')) {
        if (currentNewLine === lineNumber) {
          return currentNewLine;
        }
        currentNewLine++;
      }
      // Context line (unchanged) - can comment on this if it matches
      else if (line.startsWith(' ')) {
        if (currentNewLine === lineNumber) {
          return currentNewLine;
        }
        currentNewLine++;
      }
      // Deleted line - cannot comment on deleted lines
      else if (line.startsWith('-')) {
        // Don't increment currentNewLine for deleted lines
        continue;
      }
    }

    return null; // Line not found in diff
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

  async postSuggestions(result: ReviewResult, prNumber: number): Promise<void> {
    const hasSuggestions =
      (result.namingSuggestions && result.namingSuggestions.length > 0) || result.prTitleSuggestion;

    if (!hasSuggestions) {
      return;
    }

    let body = '## 💡 Suggestions\n\n';

    // PR Title Suggestion
    if (result.prTitleSuggestion) {
      body += `### 📝 PR Title Suggestion\n\n`;
      if (result.prTitleSuggestion.currentTitle) {
        body += `**Current title:** ${result.prTitleSuggestion.currentTitle}\n\n`;
      }
      body += `**Suggested title:** \`${result.prTitleSuggestion.suggestedTitle}\`\n\n`;
      body += `**Reason:** ${result.prTitleSuggestion.reason}\n\n`;

      if (
        result.prTitleSuggestion.alternatives &&
        result.prTitleSuggestion.alternatives.length > 0
      ) {
        body += `**Alternatives:**\n`;
        for (const alt of result.prTitleSuggestion.alternatives) {
          body += `- \`${alt}\`\n`;
        }
        body += '\n';
      }
    }

    // Naming Suggestions
    if (result.namingSuggestions && result.namingSuggestions.length > 0) {
      body += `### 🏷️ Naming Suggestions (${result.namingSuggestions.length})\n\n`;

      const suggestionsByFile = new Map<string, typeof result.namingSuggestions>();
      for (const suggestion of result.namingSuggestions) {
        const existing = suggestionsByFile.get(suggestion.file) || [];
        existing.push(suggestion);
        suggestionsByFile.set(suggestion.file, existing);
      }

      for (const [file, fileSuggestions] of suggestionsByFile.entries()) {
        body += `**\`${file}\`**\n\n`;
        for (const suggestion of fileSuggestions) {
          const typeEmoji =
            suggestion.type === 'function'
              ? '🔧'
              : suggestion.type === 'class'
                ? '🏛️'
                : suggestion.type === 'variable'
                  ? '📦'
                  : suggestion.type === 'constant'
                    ? '🔒'
                    : '📝';

          body += `- ${typeEmoji} **Line ${suggestion.line}:** `;
          body += `\`${suggestion.currentName}\` → \`${suggestion.suggestedName}\` `;
          body += `(${suggestion.type})\n`;
          body += `  - *${suggestion.reason}*\n\n`;
        }
      }
    }

    try {
      await this.postNote(prNumber, body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to post suggestions: ${errorMessage}`);
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
