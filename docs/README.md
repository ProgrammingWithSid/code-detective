# 🔍 Code-Sherlock

> AI-Powered Code Review, Security Scanner & Performance Analyzer

[![npm version](https://badge.fury.io/js/code-sherlock.svg)](https://www.npmjs.com/package/code-sherlock)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/ProgrammingWithSid/code-sherlock/actions/workflows/ci.yml/badge.svg)](https://github.com/ProgrammingWithSid/code-sherlock/actions)

Code-Sherlock is a comprehensive code analysis tool that combines AI-powered code review with security vulnerability scanning and performance analysis. It's designed to be a self-hosted alternative to CodeRabbit with additional features.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Code Review** | Multi-model support (OpenAI GPT-4, Claude, **Ollama**) with consensus voting |
| 🔒 **Security Scanner** | 14+ vulnerability patterns with CWE IDs and OWASP mapping |
| ⚡ **Performance Analyzer** | 14+ performance patterns with scoring system |
| 🔧 **Auto-Fix Suggestions** | Pattern-based and AI-powered fix generation |
| 💬 **@sherlock Commands** | Interactive PR comments for focused reviews |
| 📊 **PR Summaries** | Rich walkthroughs with Mermaid diagrams |
| 🔄 **Incremental Reviews** | Only review changed code since last review |
| 📈 **SARIF Export** | GitHub Security tab integration |
| ⚙️ **CLI Tool** | Full command-line interface for CI/CD |
| 🏠 **Local LLM (Ollama)** | Privacy-first reviews with local models |
| 📖 **Code Explanation** | AI-powered code explanations and walkthroughs |
| 🧪 **Test Generation** | Automatic unit test generation |
| 🔴 **Redis Storage** | Production-grade caching for high volume |

## 📦 Installation

```bash
# NPM
npm install code-sherlock

# Yarn
yarn add code-sherlock

# Global CLI installation
npm install -g code-sherlock
```

## 🚀 Quick Start

### CLI Usage

```bash
# Initialize configuration
sherlock init

# Review code
sherlock review --path ./src

# Security scan
sherlock security --path ./src --strict

# Performance analysis
sherlock perf --threshold 80
```

### Programmatic Usage

```typescript
import {
  createSecurityAnalyzer,
  createPerformanceAnalyzer,
  createAutoFix,
} from 'code-sherlock';

// Security Analysis
const security = createSecurityAnalyzer();
const securityResult = security.analyze([
  { path: 'src/api.ts', content: fileContent }
]);

console.log(security.formatAsMarkdown(securityResult));

// Performance Analysis
const perf = createPerformanceAnalyzer();
const perfResult = perf.analyze([
  { path: 'src/App.tsx', content: fileContent }
]);

console.log(`Score: ${perfResult.score}/100`);

// Auto-Fix Generation
const autofix = createAutoFix();
const fixes = await autofix.generateFixes({
  filePath: 'src/utils.ts',
  fileContent: code,
  language: 'typescript',
  comments: reviewComments,
});
```

## 🔒 Security Analyzer

Detects security vulnerabilities with CWE IDs and OWASP categories:

### Vulnerability Types

| Type | Description | CWE |
|------|-------------|-----|
| SQL Injection | String concatenation in queries | CWE-89 |
| XSS | innerHTML, dangerouslySetInnerHTML | CWE-79 |
| Command Injection | eval(), exec() with user input | CWE-78, CWE-95 |
| Path Traversal | User input in file paths | CWE-22 |
| Hardcoded Secrets | API keys, passwords in code | CWE-798 |
| Weak Crypto | MD5, SHA1 usage | CWE-328 |
| SSRF | User input in fetch URLs | CWE-918 |
| Open Redirect | User input in redirects | CWE-601 |

### Usage

```typescript
import { createSecurityAnalyzer } from 'code-sherlock';

const analyzer = createSecurityAnalyzer({
  minSeverity: 'warning',
  enabledChecks: ['sql-injection', 'xss', 'hardcoded-secret'],
  includeLowConfidence: false,
});

const result = analyzer.analyze(files);

// Output:
// {
//   issues: [...],
//   summary: { critical: 2, high: 5, medium: 3, low: 1 },
//   filesAnalyzed: 10,
//   analysisTime: 150
// }
```

## ⚡ Performance Analyzer

Detects performance issues with impact scoring:

### Issue Types

| Type | Impact | Description |
|------|--------|-------------|
| N+1 Queries | High | Database queries in loops |
| Memory Leaks | High | setInterval without clear, missing cleanup |
| Sync I/O | High | readFileSync, writeFileSync |
| Unbounded Queries | High | Database queries without limit |
| Large Imports | Medium | Full lodash, moment.js imports |
| Inefficient Loops | Medium | O(n²) nested loops with includes |
| Missing Memoization | Low | Objects created in render |

### Usage

```typescript
import { createPerformanceAnalyzer } from 'code-sherlock';

const analyzer = createPerformanceAnalyzer({
  focus: 'frontend', // 'backend' | 'both'
  minImpact: 'medium',
});

const result = analyzer.analyze(files);

console.log(`Performance Score: ${result.score}/100`);
// Score calculation: 100 - (high * 15) - (medium * 8) - (low * 3)
```

## 🔧 Auto-Fix Generation

Generate fix suggestions for review comments:

```typescript
import { createAutoFix } from 'code-sherlock';

const autofix = createAutoFix();

const result = await autofix.generateFixes({
  filePath: 'src/api.ts',
  fileContent: sourceCode,
  language: 'typescript',
  comments: [
    { file: 'src/api.ts', line: 10, body: 'Add null check', severity: 'warning' }
  ],
});

// Format for GitHub PR
console.log(autofix.formatAsMarkdown(result.suggestions));

// Format as GitHub suggestion (clickable apply)
const suggestion = autofix.formatAsGitHubSuggestion(result.suggestions[0].fix);
```

### Built-in Fix Patterns

- `add-null-check` - Optional chaining for null safety
- `use-const` - Replace let with const
- `template-literal` - String concat to template
- `remove-console-log` - Remove debug statements
- `async-await` - Convert .then() chains

## 🤖 Multi-Model Orchestration

Run reviews with multiple AI models and merge results:

```typescript
import { createModelOrchestrator } from 'code-sherlock';

const orchestrator = createModelOrchestrator({
  models: [
    { provider: 'openai', model: 'gpt-4', apiKey: process.env.OPENAI_API_KEY },
    { provider: 'claude', model: 'claude-3-opus', apiKey: process.env.ANTHROPIC_API_KEY },
  ],
  strategy: 'parallel', // 'sequential' | 'fallback' | 'cascade'
  consensusThreshold: 0.6,
});

const result = await orchestrator.review(files, diff);

// Result includes consensus comments agreed upon by multiple models
console.log(result.consensus);
```

## 🏠 Local LLM Support (Ollama)

Run code reviews locally without sending code to external APIs:

```typescript
import { createOllamaProvider, isOllamaRunning, RECOMMENDED_MODELS } from 'code-sherlock';

// Check if Ollama is available
if (await isOllamaRunning()) {
  const provider = createOllamaProvider({
    model: 'codellama',  // or deepseek-coder, mistral, llama2
    baseUrl: 'http://localhost:11434',
    timeout: 120000,
  });

  const result = await provider.reviewCode(code, 'file.ts');
  console.log(result.bugs, result.security);
}

// List available models
const models = await provider.listModels();
```

**Supported Models:**
- `codellama` - Meta's Code Llama (recommended)
- `deepseek-coder` - DeepSeek Coder
- `mistral` - Mistral 7B
- `llama2` - Meta's Llama 2

**Benefits:**
- 🔒 Code never leaves your infrastructure
- 💰 Free after initial setup
- 🚀 No network latency
- 🎛️ Fine-tune for your codebase

## 📖 Code Explanation

Get AI-powered explanations for complex code:

```typescript
import { createCodeExplainer, formatExplanationAsMarkdown } from 'code-sherlock';

const explainer = createCodeExplainer();

const explanation = await explainer.explain(code, 'service.ts', {
  detailLevel: 'detailed',  // 'brief' | 'normal' | 'detailed'
  audience: 'intermediate', // 'beginner' | 'intermediate' | 'expert'
});

// explanation includes:
// - summary: Brief overview
// - concepts: ['async/await', 'Classes', 'React Hooks']
// - patterns: ['Factory', 'Observer']
// - complexity: { level: 'moderate', factors: [...] }
// - dependencies: ['react', 'axios']

// Generate step-by-step walkthrough
const steps = explainer.walkthrough(code, 'service.ts');

// Format as markdown
const markdown = formatExplanationAsMarkdown(explanation);
```

## 🧪 Test Generation

Automatically generate unit tests for your code:

```typescript
import { createTestGenerator, formatTestsAsMarkdown } from 'code-sherlock';

const generator = createTestGenerator();

const result = await generator.generateTests(code, 'calculator.ts', {
  framework: 'jest',       // 'jest' | 'mocha' | 'vitest' | 'pytest'
  includeEdgeCases: true,
  includeMocks: true,
});

// result includes:
// - testFile: Complete test file content
// - tests: [{ name, code, type: 'happy-path' | 'edge-case' }]
// - imports: Required imports
// - mocks: Dependencies to mock
// - coverageEstimate: 85

console.log(result.testFile);  // Ready-to-use test file
```

## 🔴 Redis Storage

Production-grade caching for high-volume deployments:

```typescript
import { createRedisAdapter } from 'code-sherlock';

const adapter = createRedisAdapter({
  url: 'redis://localhost:6379',
  prefix: 'sherlock:',
  ttl: 604800, // 7 days
});

// Use with ReviewCache
import { createReviewCacheWithAdapter } from 'code-sherlock';

const cache = createReviewCacheWithAdapter(adapter);
await cache.saveReview(review);
```

## 💬 Interactive Commands

Use `@sherlock` commands in PR comments:

```
@sherlock review              # Full review
@sherlock review security     # Security-focused review
@sherlock review performance  # Performance-focused review
@sherlock explain <file>      # Explain code
@sherlock suggest <file>      # Suggest improvements
@sherlock help                # Show available commands
```

## ⚙️ Configuration

Create `.sherlockrc.json` in your project root:

```json
{
  "$schema": "https://code-sherlock.dev/schema.json",
  "version": "1.0",

  "ai": {
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.3
  },

  "review": {
    "enabled": true,
    "incremental": true,
    "autoFix": true
  },

  "security": {
    "enabled": true,
    "minSeverity": "warning",
    "checks": [
      "sql-injection",
      "xss",
      "command-injection",
      "hardcoded-secret"
    ]
  },

  "performance": {
    "enabled": true,
    "minImpact": "medium",
    "focus": "both",
    "threshold": 70
  },

  "ignore": [
    "node_modules/**",
    "dist/**",
    "**/*.test.ts"
  ]
}
```

## 🔄 GitHub Actions Integration

### Basic CI Workflow

```yaml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Code-Sherlock
        run: npm install -g code-sherlock

      - name: Run Security Scan
        run: sherlock security --strict --sarif security.sarif
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: security.sarif
```

### PR Review Workflow

```yaml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Code Review
        run: |
          npm install -g code-sherlock
          sherlock review -o markdown > review.md
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Post Review Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('review.md', 'utf8');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: review
            });
```

## 🛠️ CLI Reference

### `sherlock review`

```bash
sherlock review [options]

Options:
  -p, --path <path>       Path to analyze (default: ".")
  -o, --output <format>   Output format: console, json, markdown
  --files <files...>      Specific files to review
  --ignore <patterns...>  Patterns to ignore
  --fix                   Generate fix suggestions
  --strict                Exit with error on issues
```

### `sherlock security`

```bash
sherlock security [options]

Options:
  -p, --path <path>       Path to scan (default: ".")
  -o, --output <format>   Output format: console, json, markdown
  --min-severity <level>  Minimum severity: info, warning, error
  --checks <checks...>    Specific checks to run
  --sarif <file>          Output SARIF format
  --strict                Exit with error on issues
```

### `sherlock perf`

```bash
sherlock perf [options]

Options:
  -p, --path <path>       Path to analyze (default: ".")
  -o, --output <format>   Output format: console, json, markdown
  --focus <area>          Focus: frontend, backend, both
  --min-impact <level>    Minimum impact: low, medium, high
  --threshold <score>     Minimum score (0-100)
  --strict                Exit if below threshold
```

### `sherlock init`

```bash
sherlock init [options]

Options:
  --template <template>   Template: default, strict, minimal
  -f, --force            Overwrite existing config
```

## 📊 Output Formats

### Console (Default)

```
🔍 Code Review Results

📄 src/api.ts
  🔴 🔒 Line 15: Potential SQL injection via string concatenation
  🟡 ⚡ Line 32: Database query without limit

📊 Summary:
  🔴 Errors: 1 | 🟡 Warnings: 1 | 🟢 Info: 0
  🔒 Security: 1 | ⚡ Performance: 1
```

### JSON

```json
{
  "security": {
    "issues": [...],
    "summary": { "critical": 1, "high": 0, "medium": 1, "low": 0 }
  },
  "performance": {
    "score": 85,
    "issues": [...]
  }
}
```

### SARIF (for GitHub Security)

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [...]
}
```

## 🌍 Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for GPT models |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `GITHUB_TOKEN` | GitHub token for PR comments |
| `OLLAMA_HOST` | Ollama server URL (default: http://localhost:11434) |
| `REDIS_URL` | Redis connection URL for caching |

## 📚 API Reference

See the [API Documentation](./docs/API.md) for complete reference.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md).

```bash
# Clone the repo
git clone https://github.com/ProgrammingWithSid/code-sherlock.git

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## 📄 License

MIT © [dev-satender](https://github.com/dev-satender)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/dev-satender">dev-satender</a>
</p>
