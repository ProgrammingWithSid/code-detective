# Code Sherlock - Complete Usage Guide

## Table of Contents

1. [Installation](#installation)
2. [CLI Usage](#cli-usage)
3. [Programmatic Usage](#programmatic-usage)
4. [GitHub Actions](#github-actions)
5. [Local Testing](#local-testing)
6. [Configuration](#configuration)
7. [API Reference](#api-reference)

---

## Installation

### Global Installation

```bash
npm install -g code-sherlock
```

### Local Installation

```bash
npm install code-sherlock
```

### From Source

```bash
git clone https://github.com/your-org/code-sherlock.git
cd code-sherlock
npm install
npm run build
npm link
```

---

## CLI Usage

### 1. Initialize Configuration

```bash
# Create default configuration file
code-sherlock init

# Create with custom options
code-sherlock init --provider openai --output json
```

### 2. Review Commands

#### Review a PR by Number

```bash
# Review PR #123
code-sherlock review --pr 123

# Review PR with posting comments back to GitHub
code-sherlock review --pr 123 --post

# Review with custom config
code-sherlock review --pr 123 --config ./my-config.json
```

#### Review a Branch

```bash
# Review branch against main
code-sherlock review --branch feature/my-feature

# Review branch against custom base
code-sherlock review --branch feature/my-feature --base develop

# Review and post comments
code-sherlock review --branch feature/my-feature --post
```

#### Review Local Files

```bash
# Review specific files
code-sherlock review --path src/components/

# Review with specific checks
code-sherlock review --path src/ --security --performance
```

### 3. Security Analysis

```bash
# Run security scan on a directory
code-sherlock security ./src

# Run specific security checks
code-sherlock security ./src --checks sql-injection,xss,hardcoded-secrets

# Output in SARIF format (for GitHub Security tab)
code-sherlock security ./src --output sarif --sarif-file results.sarif

# Output as JSON
code-sherlock security ./src --output json

# Set severity threshold
code-sherlock security ./src --severity high --fail-on-issues
```

Available security checks:
- `sql-injection` - SQL Injection vulnerabilities
- `xss` - Cross-Site Scripting
- `hardcoded-secrets` - Hardcoded passwords, API keys
- `weak-crypto` - Weak cryptographic algorithms
- `path-traversal` - Path traversal attacks
- `command-injection` - Command injection
- `insecure-deserialization` - Unsafe deserialization
- `ssrf` - Server-Side Request Forgery
- `cors-misconfiguration` - CORS issues
- `jwt-issues` - JWT security problems

### 4. Performance Analysis

```bash
# Analyze performance issues
code-sherlock performance ./src

# Output as JSON with details
code-sherlock performance ./src --output json

# Set minimum score threshold
code-sherlock performance ./src --min-score 70
```

### 5. Output Formats

```bash
# Markdown (default)
code-sherlock review --pr 123 --output markdown

# JSON
code-sherlock review --pr 123 --output json

# GitHub-compatible markdown
code-sherlock review --pr 123 --output github
```

---

## Programmatic Usage

### Basic Review

```typescript
import { PRReviewer, createAIProvider, loadConfig } from 'code-sherlock';

async function reviewPR() {
  const config = loadConfig('./code-sherlock.config.json');
  const aiProvider = createAIProvider(config.aiProvider);

  const reviewer = new PRReviewer(config, aiProvider);
  const result = await reviewer.review('feature-branch', 'main', 123);

  console.log(`Found ${result.comments.length} issues`);
  console.log(result.summary);
}
```

### Security Analysis

```typescript
import { SecurityAnalyzer, createSecurityAnalyzer } from 'code-sherlock';

const analyzer = createSecurityAnalyzer({
  enabledChecks: ['sql-injection', 'xss', 'hardcoded-secrets'],
  severityThreshold: 'medium',
});

const results = analyzer.analyzeFile('src/api/users.ts', fileContent);

for (const issue of results.issues) {
  console.log(`[${issue.severity}] ${issue.type}: ${issue.message}`);
  console.log(`  Line ${issue.line}: ${issue.codeSnippet}`);
  console.log(`  Fix: ${issue.recommendation}`);
}
```

### Performance Analysis

```typescript
import { PerformanceAnalyzer, createPerformanceAnalyzer } from 'code-sherlock';

const analyzer = createPerformanceAnalyzer({
  thresholds: {
    maxLoopNesting: 3,
    maxFunctionLength: 50,
  },
});

const results = analyzer.analyzeFile('src/utils/data.ts', fileContent, 'typescript');

console.log(`Performance Score: ${results.score}/100`);
console.log(`Grade: ${results.grade}`);

for (const bottleneck of results.bottlenecks) {
  console.log(`[${bottleneck.impact}] ${bottleneck.type}: ${bottleneck.description}`);
}
```

### Auto-Fix Generation

```typescript
import { AutoFix, createAutoFix } from 'code-sherlock';

const autofix = createAutoFix({ aiProvider, config });

// Generate fixes for review comments
const fixes = autofix.generateFixes(reviewComments);

for (const fix of fixes.suggestions) {
  console.log(`File: ${fix.filePath}`);
  console.log(`Original:\n${fix.originalCode}`);
  console.log(`Fixed:\n${fix.fixedCode}`);
  console.log(`Confidence: ${fix.confidence}`);
}

// Apply fixes
const fileContents = new Map([['src/api.ts', originalCode]]);
const applied = autofix.applyFixes(fixes.suggestions, fileContents);

console.log(`Applied: ${applied.applied.length}`);
console.log(`Skipped: ${applied.skipped.length}`);
```

### Multi-Model Orchestration

```typescript
import { ModelOrchestrator, createModelOrchestrator } from 'code-sherlock';

const orchestrator = createModelOrchestrator({
  models: [
    { provider: 'openai', model: 'gpt-4', weight: 1.0 },
    { provider: 'anthropic', model: 'claude-3-opus', weight: 1.0 },
  ],
  strategy: 'parallel', // parallel, sequential, fallback, ensemble
  consensusThreshold: 0.7,
});

const result = orchestrator.review(codeChunks);

console.log(`Consensus comments: ${result.comments.length}`);
console.log(`Model agreement: ${result.metadata.modelAgreement}`);
```

### Incremental Review (Delta Analysis)

```typescript
import { IncrementalReviewer, createIncrementalReviewer } from 'code-sherlock';

const reviewer = createIncrementalReviewer(config, aiProvider, {
  storage: { type: 'file', filePath: '.sherlock-cache.json' },
  excludeResolved: true,
});

// First review - reviews all files
const result1 = await reviewer.reviewPR('feature', 'main', 123);
console.log(`Reviewed: ${result1.reviewedFiles.length} files`);

// Second review - only reviews changed files
const result2 = await reviewer.reviewPR('feature', 'main', 123);
console.log(`Reviewed: ${result2.reviewedFiles.length} (incremental)`);
console.log(`Skipped: ${result2.skippedFiles.length} (unchanged)`);
```

### Context-Aware Review

```typescript
import { UnifiedContextEngine, createUnifiedContextEngine } from 'code-sherlock';

const engine = createUnifiedContextEngine({
  learnRepoContext: true,
  learnFromHistory: true,
});

engine.initialize('owner/repo');

// Build context from PR
const context = await engine.buildContext({
  repository: 'owner/repo',
  prData: { number: 123, title: 'Add feature', ... },
  files: [{ path: 'src/feature.ts', content: '...', ... }],
});

// Use context for enhanced review
const enhancedReview = await engine.enhanceReview(baseReviewResult, context);
```

### Post Comments to GitHub

```typescript
import { PRCommentService, createPRCommentService } from 'code-sherlock';

const commentService = createPRCommentService({
  platform: 'github',
  owner: 'your-org',
  repo: 'your-repo',
  token: process.env.GITHUB_TOKEN,
});

// Post individual comments
await commentService.postComments(reviewResult, prNumber);

// Post summary
await commentService.postReviewSummary(reviewResult, prNumber);
```

### Ollama (Local LLM) Provider

```typescript
import { OllamaProvider, createOllamaProvider } from 'code-sherlock';

const provider = createOllamaProvider({
  baseUrl: 'http://localhost:11434',
  model: 'codellama:13b',
  timeout: 120000,
});

// Check availability
const isAvailable = await provider.isAvailable();
if (isAvailable) {
  const models = await provider.listModels();
  console.log('Available models:', models);
}

// Use for review
const result = provider.review(codeContent, 'typescript');
```

### Code Explanation

```typescript
import { CodeExplainer, createCodeExplainer } from 'code-sherlock';

const explainer = createCodeExplainer(aiProvider, config);

const explanation = explainer.explainCode({
  code: complexFunction,
  language: 'typescript',
  detail: 'detailed', // 'brief', 'detailed', 'comprehensive'
  focusAreas: ['logic', 'complexity', 'side-effects'],
});

console.log(explanation.summary);
console.log(explanation.breakdown);
console.log(explanation.suggestions);
```

### Test Generation

```typescript
import { TestGenerator, createTestGenerator } from 'code-sherlock';

const generator = createTestGenerator(aiProvider, config);

const tests = generator.generateTests({
  code: functionToTest,
  language: 'typescript',
  framework: 'jest', // 'jest', 'vitest', 'mocha', 'pytest'
  coverage: ['happy-path', 'edge-cases', 'error-handling'],
});

console.log(tests.testCode);
console.log(`Generated ${tests.testCases.length} test cases`);
```

---

## GitHub Actions

### Basic PR Review

```yaml
# .github/workflows/code-review.yml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Code Sherlock
        run: npm install -g code-sherlock

      - name: Run Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          code-sherlock review \
            --pr ${{ github.event.pull_request.number }} \
            --post
```

### Security Scan

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 0 * * 0' # Weekly

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Security Scan
        run: |
          npx code-sherlock security ./src \
            --output sarif \
            --sarif-file results.sarif

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

### Reusable Action

```yaml
# Using the custom action
- uses: your-org/code-sherlock-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
    review_mode: 'thorough'
    post_comments: true
    security_scan: true
```

---

## Local Testing

### Test on Current Branch

```bash
# Set environment variables
export OPENAI_API_KEY=your-key
export GITHUB_TOKEN=your-token

# Review current branch against main
code-sherlock review --branch $(git branch --show-current) --base main
```

### Test on Specific PR

```bash
# Create config file
cat > code-sherlock.config.json << EOF
{
  "aiProvider": {
    "provider": "openai",
    "model": "gpt-4-turbo",
    "apiKey": "$OPENAI_API_KEY"
  },
  "repository": {
    "owner": "your-org",
    "repo": "your-repo"
  },
  "github": {
    "token": "$GITHUB_TOKEN"
  }
}
EOF

# Run review
code-sherlock review --pr 123 --config code-sherlock.config.json
```

### Docker Usage

```bash
# Build image
docker build -t code-sherlock .

# Run review
docker run -e OPENAI_API_KEY -e GITHUB_TOKEN \
  -v $(pwd):/workspace \
  code-sherlock review --path /workspace/src
```

---

## Configuration

### Configuration File (.sherlockrc.json)

```json
{
  "aiProvider": {
    "provider": "openai",
    "model": "gpt-4-turbo",
    "apiKey": "${OPENAI_API_KEY}",
    "temperature": 0.3,
    "maxTokens": 4000
  },
  "repository": {
    "owner": "your-org",
    "repo": "your-repo"
  },
  "github": {
    "token": "${GITHUB_TOKEN}"
  },
  "review": {
    "maxFilesPerReview": 20,
    "excludePatterns": [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/node_modules/**",
      "**/dist/**"
    ],
    "focusAreas": ["security", "performance", "readability"],
    "severityThreshold": "medium"
  },
  "security": {
    "enabledChecks": [
      "sql-injection",
      "xss",
      "hardcoded-secrets",
      "weak-crypto"
    ],
    "severityThreshold": "medium"
  },
  "performance": {
    "minScore": 60,
    "enabledChecks": [
      "n-plus-one",
      "memory-leaks",
      "inefficient-loops"
    ]
  },
  "output": {
    "format": "markdown",
    "includeCodeSnippets": true,
    "includeSuggestions": true
  }
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | Yes (if using OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes (if using Claude) |
| `GITHUB_TOKEN` | GitHub token for API access | Yes (for GitHub integration) |
| `GITLAB_TOKEN` | GitLab token for API access | Yes (for GitLab integration) |
| `OLLAMA_BASE_URL` | Ollama server URL | No (default: http://localhost:11434) |

---

## API Reference

### Main Classes

| Class | Description |
|-------|-------------|
| `PRReviewer` | Main reviewer for pull requests |
| `IncrementalReviewer` | Delta-based incremental reviews |
| `SecurityAnalyzer` | Security vulnerability detection |
| `PerformanceAnalyzer` | Performance bottleneck detection |
| `AutoFix` | Automatic code fix generation |
| `ModelOrchestrator` | Multi-model AI coordination |
| `UnifiedContextEngine` | Context building and learning |
| `PRCommentService` | GitHub/GitLab comment posting |

### Factory Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `createAIProvider(config)` | `AIProviderInterface` | Create AI provider |
| `createSecurityAnalyzer(options)` | `SecurityAnalyzer` | Create security analyzer |
| `createPerformanceAnalyzer(options)` | `PerformanceAnalyzer` | Create performance analyzer |
| `createAutoFix(options)` | `AutoFix` | Create auto-fix service |
| `createIncrementalReviewer(config, ai, options)` | `IncrementalReviewer` | Create incremental reviewer |
| `createPRCommentService(options)` | `PRCommentService` | Create comment service |
| `createOllamaProvider(config)` | `OllamaProvider` | Create Ollama provider |
| `createCodeExplainer(ai, config)` | `CodeExplainer` | Create code explainer |
| `createTestGenerator(ai, config)` | `TestGenerator` | Create test generator |

---

## Examples Repository

See the `/examples` directory for complete working examples:

- `examples/basic-review/` - Simple PR review
- `examples/security-scan/` - Security analysis workflow
- `examples/github-action/` - GitHub Actions integration
- `examples/multi-model/` - Multi-model orchestration
- `examples/local-llm/` - Ollama integration

---

## Troubleshooting

### Common Issues

**1. "API key not found"**
```bash
# Ensure environment variable is set
export OPENAI_API_KEY=your-key-here
# Or use config file
```

**2. "Context length exceeded"**
```bash
# Use a model with larger context
code-sherlock review --pr 123 --model gpt-4-turbo

# Or limit files reviewed
code-sherlock review --pr 123 --max-files 10
```

**3. "Rate limit exceeded"**
```bash
# Add delay between requests
code-sherlock review --pr 123 --rate-limit 5

# Or use multiple providers
code-sherlock review --pr 123 --fallback claude-3-sonnet
```

**4. "Permission denied posting comments"**
```bash
# Ensure token has correct permissions
# Required: repo, write:discussion (for GitHub)
```

