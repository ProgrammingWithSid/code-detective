# Code Detective - AST-Based PR Reviewer

A powerful PR review tool that uses [chunkyyy](https://github.com/your-org/chunkyyy) for semantic code chunking and AI models (OpenAI/Claude) for intelligent code review.

## Features

- 🔍 **AST-Based Chunking**: Uses chunkyyy to intelligently chunk code into semantic units
- 🤖 **AI-Powered Review**: Leverages OpenAI or Claude for comprehensive code analysis
- 📋 **Global Rules**: Define custom review rules in natural language
- 💬 **PR Integration**: Automatically posts comments to GitHub or GitLab PRs
- 🎯 **Range-Based Selection**: Review specific code ranges using chunkyyy's range method
- 🔄 **Incremental Review**: Only reviews changed files in PRs

## Installation

```bash
npm install code-detective
```

## Quick Start

### 1. Initialize Configuration

```bash
code-detective init
```

This creates a `code-detective.config.json` file. Update it with your settings:

```json
{
  "aiProvider": "openai",
  "openai": {
    "apiKey": "your-openai-api-key",
    "model": "gpt-4-turbo-preview"
  },
  "globalRules": [
    "Check for security vulnerabilities",
    "Ensure proper error handling",
    "Follow TypeScript best practices"
  ],
  "repository": {
    "owner": "your-org",
    "repo": "your-repo",
    "baseBranch": "main"
  },
  "pr": {
    "number": 123
  },
  "github": {
    "token": "your-github-token"
  }
}
```

### 2. Review a PR

```bash
code-detective review -b feature-branch --base main
```

### 3. Review a Specific File

```bash
code-detective review-file -f src/utils.ts -b feature-branch
```

### 4. Review a Code Range

```bash
code-detective review-file -f src/utils.ts -b feature-branch --start-line 10 --end-line 50
```

## Configuration

### Environment Variables

You can also use environment variables instead of config file:

```bash
export AI_PROVIDER=openai
export OPENAI_API_KEY=your-key
export GITHUB_TOKEN=your-token
```

### Global Rules

Define custom review rules in natural language. Examples:

```json
{
  "globalRules": [
    "Always check for SQL injection vulnerabilities",
    "Ensure all async functions have proper error handling",
    "Verify that sensitive data is not logged",
    "Check for memory leaks in long-running processes",
    "Ensure API endpoints have rate limiting"
  ]
}
```

## CLI Commands

### `review`

Review a PR by branch name:

```bash
code-detective review -b feature-branch [options]
```

Options:
- `-b, --branch <branch>`: Target branch to review (required)
- `--base <base>`: Base branch (default: main)
- `-c, --config <path>`: Path to config file
- `--no-comments`: Skip posting comments to PR
- `--repo <path>`: Path to repository

### `review-file`

Review a specific file:

```bash
code-detective review-file -f <file> -b <branch> [options]
```

Options:
- `-f, --file <path>`: File path to review (required)
- `-b, --branch <branch>`: Branch to review (required)
- `--start-line <number>`: Start line number
- `--end-line <number>`: End line number
- `-c, --config <path>`: Path to config file
- `--repo <path>`: Path to repository

### `init`

Initialize configuration file:

```bash
code-detective init [-c <config-path>]
```

## Programmatic Usage

```typescript
import { PRReviewer, ConfigLoader } from 'code-detective';

// Load configuration
const config = ConfigLoader.load('code-detective.config.json');
ConfigLoader.validate(config);

// Create reviewer
const reviewer = new PRReviewer(config);

// Review PR
const result = await reviewer.reviewPR('feature-branch', 'main', true);

console.log(`Found ${result.stats.errors} errors`);
console.log(`Found ${result.stats.warnings} warnings`);
```

## How It Works

1. **Checkout Branch**: Checks out the target branch for review
2. **Detect Changes**: Identifies changed files between base and target branches
3. **Chunk Code**: Uses chunkyyy to intelligently chunk code into semantic units
4. **AI Review**: Sends chunks to AI model (OpenAI/Claude) with global rules
5. **Post Comments**: Posts review comments directly to the PR

## Supported Providers

### OpenAI

```json
{
  "aiProvider": "openai",
  "openai": {
    "apiKey": "sk-...",
    "model": "gpt-4-turbo-preview"
  }
}
```

### Claude (Anthropic)

```json
{
  "aiProvider": "claude",
  "claude": {
    "apiKey": "sk-ant-...",
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

## PR Platform Support

### GitHub

```json
{
  "github": {
    "token": "ghp_..."
  },
  "repository": {
    "owner": "your-org",
    "repo": "your-repo"
  },
  "pr": {
    "number": 123
  }
}
```

### GitLab

```json
{
  "gitlab": {
    "token": "glpat-...",
    "projectId": "123456"
  },
  "pr": {
    "number": 123
  }
}
```

## Examples

### Basic PR Review

```bash
# Review feature branch against main
code-detective review -b feature/add-auth --base main
```

### Review Without Posting Comments

```bash
# Review but don't post comments (useful for testing)
code-detective review -b feature/add-auth --no-comments
```

### Review Specific File Range

```bash
# Review lines 10-50 of a specific file
code-detective review-file \
  -f src/auth.ts \
  -b feature/add-auth \
  --start-line 10 \
  --end-line 50
```

## License

MIT
