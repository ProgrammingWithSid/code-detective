# Code-Sherlock Quick Start

## 🚀 3-Step Setup

### Step 1: Install
```bash
npm install -g code-sherlock
```

### Step 2: Configure
```bash
# Create config file
code-sherlock init

# Set API keys
export OPENAI_API_KEY=sk-your-key-here
export GITHUB_TOKEN=ghp-your-token-here
```

### Step 3: Review PR
```bash
# Review PR #123
code-sherlock review --pr 123

# Or review a branch
code-sherlock review --branch feature/my-feature
```

## 📋 Essential Commands

```bash
# Review PR by number
code-sherlock review --pr <number>

# Review branch
code-sherlock review --branch <branch-name>

# Review and post comments to GitHub
code-sherlock review --pr <number> --post

# Review with JSON output
code-sherlock review --pr <number> --output json

# Review specific files only
code-sherlock review --branch <branch> --files src/file1.ts src/file2.ts
```

## ⚙️ Minimal Config File

Create `code-sherlock.config.json`:

```json
{
  "aiProvider": "openai",
  "openai": {
    "apiKey": "${OPENAI_API_KEY}",
    "model": "gpt-4-turbo-preview"
  },
  "repository": {
    "owner": "your-org",
    "repo": "your-repo",
    "baseBranch": "main"
  },
  "github": {
    "token": "${GITHUB_TOKEN}"
  }
}
```

## 🔑 Required Environment Variables

```bash
export OPENAI_API_KEY=sk-...          # Required for AI review
export GITHUB_TOKEN=ghp-...          # Required for posting comments
```

## 📖 Full Documentation

See [PR_REVIEW_GUIDE.md](./PR_REVIEW_GUIDE.md) for complete documentation.
