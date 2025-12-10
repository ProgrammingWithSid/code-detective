/**
 * Webhook Types for GitHub/GitLab event handling
 */

// ============================================================================
// GitHub Webhook Types
// ============================================================================

export type GitHubWebhookEvent =
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'issue_comment'
  | 'push';

export type GitHubPRAction =
  | 'opened'
  | 'synchronize'
  | 'reopened'
  | 'closed'
  | 'edited'
  | 'ready_for_review';

export type GitHubCommentAction = 'created' | 'edited' | 'deleted';

export interface GitHubUser {
  login: string;
  id: number;
  type: 'User' | 'Bot';
  avatar_url?: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  private: boolean;
  default_branch: string;
  html_url: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser;
  head: {
    ref: string;
    sha: string;
    repo: GitHubRepository;
  };
  base: {
    ref: string;
    sha: string;
    repo: GitHubRepository;
  };
  html_url: string;
  diff_url: string;
  patch_url: string;
  draft: boolean;
  merged: boolean;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  html_url: string;
  // For PR review comments
  path?: string;
  line?: number;
  commit_id?: string;
  diff_hunk?: string;
  // For issue comments
  issue_url?: string;
}

export interface GitHubPRWebhookPayload {
  action: GitHubPRAction;
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
  installation?: { id: number };
}

export interface GitHubCommentWebhookPayload {
  action: GitHubCommentAction;
  comment: GitHubComment;
  pull_request?: GitHubPullRequest;
  issue?: { number: number; title: string; body: string | null };
  repository: GitHubRepository;
  sender: GitHubUser;
  installation?: { id: number };
}

export interface GitHubReviewWebhookPayload {
  action: 'submitted' | 'edited' | 'dismissed';
  review: {
    id: number;
    body: string | null;
    state: 'approved' | 'changes_requested' | 'commented' | 'pending';
    user: GitHubUser;
    commit_id: string;
  };
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
  installation?: { id: number };
}

// ============================================================================
// GitLab Webhook Types
// ============================================================================

export type GitLabWebhookEvent = 'merge_request' | 'note' | 'push';

export type GitLabMRAction = 'open' | 'update' | 'merge' | 'close' | 'reopen';

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed' | 'merged';
  source_branch: string;
  target_branch: string;
  author_id: number;
  url: string;
}

export interface GitLabNote {
  id: number;
  body: string;
  author: GitLabUser;
  created_at: string;
  updated_at: string;
  noteable_type: 'MergeRequest' | 'Issue' | 'Commit';
  position?: {
    new_path: string;
    new_line: number;
    old_path?: string;
    old_line?: number;
  };
}

export interface GitLabMRWebhookPayload {
  object_kind: 'merge_request';
  event_type: 'merge_request';
  user: GitLabUser;
  project: GitLabProject;
  object_attributes: GitLabMergeRequest & {
    action: GitLabMRAction;
  };
}

export interface GitLabNoteWebhookPayload {
  object_kind: 'note';
  event_type: 'note';
  user: GitLabUser;
  project: GitLabProject;
  object_attributes: GitLabNote;
  merge_request?: GitLabMergeRequest;
}

// ============================================================================
// Unified Webhook Types
// ============================================================================

export type WebhookPlatform = 'github' | 'gitlab';

export interface NormalizedWebhookEvent {
  platform: WebhookPlatform;
  eventType: 'pr_opened' | 'pr_updated' | 'comment_created' | 'comment_edited';
  prNumber: number;
  owner: string;
  repo: string;
  sender: string;
  comment?: {
    id: number;
    body: string;
    filePath?: string;
    lineNumber?: number;
  };
  pr?: {
    title: string;
    body: string | null;
    baseBranch: string;
    headBranch: string;
    isDraft: boolean;
  };
}

// ============================================================================
// Webhook Handler Interface
// ============================================================================

export interface WebhookHandler {
  /** Verify webhook signature */
  verifySignature(payload: string, signature: string, secret: string): boolean;
  /** Parse and normalize webhook payload */
  parsePayload(body: unknown, headers: Record<string, string>): NormalizedWebhookEvent | null;
  /** Process the webhook event */
  handleEvent(event: NormalizedWebhookEvent): Promise<void>;
}

// ============================================================================
// Webhook Response Types
// ============================================================================

export interface WebhookResponse {
  success: boolean;
  message: string;
  reviewId?: string;
  error?: string;
}
