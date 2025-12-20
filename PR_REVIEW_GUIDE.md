# Code-Sherlock PR Review Guide

Complete guide for using code-sherlock CLI to review pull requests.

## Installation

### Global Installation (Recommended)
```bash
npm install -g code-sherlock
```

### Local Installation
```bash
npm install code-sherlock
# Then use: npx code-sherlock or npm run sherlock
```

## Quick Start

### 1. Initialize Configuration

```bash
# Create default config file (.sherlockrc.json)
code-sherlock init

# Or use a specific template
code-sherlock init --template default    # Balanced settings
code-sherlock init --template strict     # Strict review settings
code-sherlock init --template minimal    # Minimal settings
```

### 2. Set Up Environment Variables

```bash
# For OpenAI
export OPENAI_API_KEY=sk-your-openai-api-key

# For Claude (Alternative)
export ANTHROPIC_API_KEY=sk-ant-your-claude-api-key

# For GitHub integration (to post comments)
export GITHUB_TOKEN=ghp-your-github-token
```

### 3. Create Configuration File

Create `code-sherlock.config.json` in your repository root:

```json
{
  "aiProvider": "openai",
  "openai": {
    "apiKey": "${OPENAI_API_KEY}",
    "model": "gpt-4-turbo-preview"
  },
  "claude": {
    "apiKey": "${ANTHROPIC_API_KEY}",
    "model": "claude-3-5-sonnet-20241022"
  },
  "globalRules": [
    "Check for security vulnerabilities including SQL injection, XSS, and CSRF",
    "Ensure proper error handling with appropriate error messages",
    "Follow SOLID principles and clean code practices",
    "Check for potential memory leaks and resource cleanup",
    "Verify proper input validation and sanitization",
    "Ensure consistent code style and naming conventions",
    "Check for potential performance bottlenecks",
    "Verify proper async/await usage and promise handling"
  ],
  "repository": {
    "owner": "your-github-org",
    "repo": "your-repo-name",
    "baseBranch": "main"
  },
  "pr": {
    "number": 0,
    "baseBranch": "main"
  },
  "github": {
    "token": "${GITHUB_TOKEN}"
  }
}
```

**Note:** The config loader looks for `code-sherlock.config.json` by default, but you can specify a custom path with `--config`.

## PR Review Commands

### Review PR by Number

```bash
# Basic PR review (PR #123)
code-sherlock review --pr 123

# Review PR and post comments to GitHub
code-sherlock review --pr 123 --post

# Review PR with custom config file
code-sherlock review --pr 123 --config ./my-config.json

# Review PR with custom base branch
code-sherlock review --pr 123 --base develop

# Review PR and output as JSON
code-sherlock review --pr 123 --output json

# Review PR and output as Markdown
code-sherlock review --pr 123 --output markdown

# Review PR with strict mode (exit with error if issues found)
code-sherlock review --pr 123 --strict
```

### Review Branch

```bash
# Review branch against main
code-sherlock review --branch feature/my-feature

# Review branch against custom base
code-sherlock review --branch feature/my-feature --base develop

# Review current branch
code-sherlock review --branch $(git branch --show-current)

# Review branch and post comments (if PR exists)
code-sherlock review --branch feature/my-feature --post
```

### Review Specific Files

```bash
# Review specific files in a branch
code-sherlock review --branch feature/my-feature --files src/file1.ts src/file2.ts

# Review files with ignore patterns
code-sherlock review --branch feature/my-feature --ignore "**/*.test.ts" "**/*.spec.ts"
```

### Advanced Options

```bash
# Use Claude instead of OpenAI
code-sherlock review --pr 123 --model claude

# Incremental review (only changed files since last review)
code-sherlock review --pr 123 --incremental

# Generate fix suggestions
code-sherlock review --pr 123 --fix

# Review with custom repository path
code-sherlock review --pr 123 --repo /path/to/repo
```

## Complete Command Reference

### Review Command Options

| Option | Description | Example |
|--------|-------------|---------|
| `--pr <number>` | PR number to review | `--pr 123` |
| `--branch <branch>` | Branch to review | `--branch feature/xyz` |
| `--base <branch>` | Base branch for comparison | `--base develop` |
| `--config <file>` | Config file path | `--config ./config.json` |
| `--post` | Post comments to PR | `--post` |
| `--output <format>` | Output format (console, json, markdown) | `--output json` |
| `--model <model>` | AI model (openai, claude) | `--model claude` |
| `--files <files...>` | Specific files to review | `--files src/a.ts src/b.ts` |
| `--ignore <patterns...>` | Patterns to ignore | `--ignore "**/*.test.ts"` |
| `--incremental` | Only review changed files | `--incremental` |
| `--fix` | Generate fix suggestions | `--fix` |
| `--strict` | Fail on any issues found | `--strict` |
| `--repo <path>` | Repository path | `--repo /path/to/repo` |

## Configuration File Format

### Full Configuration Example

```json
{
  "aiProvider": "openai",
  "openai": {
    "apiKey": "${OPENAI_API_KEY}",
    "model": "gpt-4-turbo-preview"
  },
  "claude": {
    "apiKey": "${ANTHROPIC_API_KEY}",
    "model": "claude-3-5-sonnet-20241022"
  },
  "globalRules": [
    "Check for security vulnerabilities",
    "Ensure proper error handling",
    "Follow SOLID principles"
  ],
  "repository": {
    "owner": "your-org",
    "repo": "your-repo",
    "baseBranch": "main"
  },
  "pr": {
    "number": 0,
    "baseBranch": "main"
  },
  "github": {
    "token": "${GITHUB_TOKEN}"
  },
  "gitlab": {
    "token": "${GITLAB_TOKEN}",
    "projectId": "your-project-id"
  }
}
```

### Configuration Fields

- **aiProvider**: `"openai"` or `"claude"`
- **openai/claude**: API configuration with `apiKey` and `model`
- **globalRules**: Array of review rules/guidelines
- **repository**: Repository information (owner, repo, baseBranch)
- **pr**: PR-specific settings
- **github/gitlab**: Platform tokens for posting comments

## Common Workflows

### Workflow 1: Review Local PR Before Pushing

```bash
# 1. Checkout your feature branch
git checkout feature/my-feature

# 2. Review against main
code-sherlock review --branch feature/my-feature --base main

# 3. Review output will show issues in console
```

### Workflow 2: Review Existing PR

```bash
# 1. Set environment variables
export OPENAI_API_KEY=sk-...
export GITHUB_TOKEN=ghp-...

# 2. Review PR #123
code-sherlock review --pr 123

# 3. Post comments to PR
code-sherlock review --pr 123 --post
```

### Workflow 3: CI/CD Integration

```bash
# In your CI script
code-sherlock review \
  --pr $PR_NUMBER \
  --config ./code-sherlock.config.json \
  --strict \
  --output json > review-results.json
```

### Workflow 4: Review Specific Files Only

```bash
# Review only changed files in a PR
code-sherlock review --pr 123 --files src/api/users.ts src/api/auth.ts
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | Yes (if using OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes (if using Claude) |
| `GITHUB_TOKEN` | GitHub token for API access | Yes (for GitHub integration) |
| `GITLAB_TOKEN` | GitLab token for API access | Yes (for GitLab integration) |

## Output Formats

### Console (Default)
Human-readable colored output in terminal.

### JSON
```bash
code-sherlock review --pr 123 --output json
```
Returns structured JSON with comments, stats, and summary.

### Markdown
```bash
code-sherlock review --pr 123 --output markdown
```
Returns markdown-formatted review suitable for documentation or PR comments.

## Troubleshooting

### Issue: "API key not found"
**Solution:** Set environment variable or include in config file
```bash
export OPENAI_API_KEY=sk-your-key
```

### Issue: "Config file not found"
**Solution:** Create config file or specify path
```bash
code-sherlock init
# or
code-sherlock review --pr 123 --config ./custom-config.json
```

### Issue: "Permission denied posting comments"
**Solution:** Ensure GitHub token has correct permissions
- Required scopes: `repo`, `write:discussion`

### Issue: "PR not found"
**Solution:** Ensure repository config is correct and PR number exists
```json
{
  "repository": {
    "owner": "correct-org",
    "repo": "correct-repo"
  }
}
```

### Issue: "Context length exceeded"
**Solution:** Use a model with larger context or limit files
```bash
code-sherlock review --pr 123 --model gpt-4-turbo
# or review specific files only
code-sherlock review --pr 123 --files src/main.ts
```

## Examples

### Example 1: Basic PR Review
```bash
# Setup
export OPENAI_API_KEY=sk-...
export GITHUB_TOKEN=ghp-...

# Review PR #42
code-sherlock review --pr 42
```

### Example 2: Review with Custom Rules
```json
{
  "globalRules": [
    "Check for TypeScript type safety",
    "Ensure all async functions have error handling",
    "Verify no console.log statements in production code",
    "Check for proper JSDoc documentation"
  ]
}
```

### Example 3: Review Branch Before Creating PR
```bash
# Review feature branch
code-sherlock review --branch feature/add-login --base main

# Fix issues, then create PR
git push origin feature/add-login
```

### Example 4: Automated Review Script
```bash
#!/bin/bash
# review-pr.sh

PR_NUMBER=$1
BASE_BRANCH=${2:-main}

code-sherlock review \
  --pr $PR_NUMBER \
  --base $BASE_BRANCH \
  --output json \
  --strict

if [ $? -eq 0 ]; then
  echo "✅ Review passed"
else
  echo "❌ Review found issues"
  exit 1
fi
```

## Tips

1. **Start with default config**: Use `code-sherlock init` to get started quickly
2. **Use environment variables**: Keep API keys secure by using env vars
3. **Test locally first**: Review your branch before creating a PR
4. **Use --strict for CI**: Enable strict mode in CI/CD pipelines
5. **Customize rules**: Add repository-specific rules to `globalRules`
6. **Incremental reviews**: Use `--incremental` for faster reviews on updated PRs

## Additional Commands

### Security Scan
```bash
code-sherlock security ./src
```

### Performance Analysis
```bash
code-sherlock performance ./src
```

### Help
```bash
code-sherlock --help
code-sherlock review --help
```
