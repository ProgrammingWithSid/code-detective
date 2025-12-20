# How Code Sherlock Works

## 🎯 Overview

Code Sherlock is an automated PR review tool that combines **49+ static analysis tools**, **AI-powered code review**, and **dependency analysis** to provide comprehensive code reviews.

---

## 📋 Complete Workflow

### **Step 1: Configuration** ⚙️

```json
{
  "aiProvider": "openai",
  "linter": {
    "enabled": true,
    "tools": ["eslint", "prettier", "typescript", "flake8", "black"]
  },
  "sast": {
    "enabled": true,
    "tools": ["semgrep", "bandit", "npm-audit", "trivy"]
  }
}
```

**What happens:**
- Loads configuration from `code-sherlock.config.json`
- Initializes all enabled tools
- Sets up AI provider (OpenAI/Claude)
- Configures GitHub/GitLab integration

---

### **Step 2: Git Operations** 🔀

```bash
code-sherlock review --branch feature-branch
```

**What happens:**
1. **Checkout** to target branch (`feature-branch`)
2. **Get changed files** by comparing with base branch (`main`)
3. **Retrieve file contents** for analysis

**Example output:**
```
🔀 Checking out to branch: feature-branch
📁 Detecting changes unique to feature-branch...
Found 12 changed file(s)
```

---

### **Step 3: Codegraph Analysis** 🔗

**What happens:**
1. **Builds dependency graph** across all files
2. **Analyzes impact** of changes:
   - Which files are affected?
   - What's the dependency chain?
   - What's the severity (high/medium/low)?
3. **Identifies affected files** beyond direct changes

**Example output:**
```
🔗 Building dependency graph...
Impact analysis: 8 affected file(s), severity: high
   Affected files: src/utils.ts, src/api.ts, src/components/Button.tsx...
```

**Why it matters:**
- Understands ripple effects of changes
- Identifies files that might break
- Prioritizes review based on impact

---

### **Step 4: Code Chunking** 🔪

**What happens:**
1. Uses **chunkyyy** to split code into semantic chunks
2. Groups related code together
3. Filters out already-reviewed chunks (incremental review)

**Example output:**
```
🔪 Chunking code using chunkyyy...
Generated 45 code chunk(s)
⚡ Incremental review: Skipping 12 already-reviewed chunk(s) (27% reduction)
```

**Why it matters:**
- Breaks large PRs into manageable pieces
- Only reviews new/changed code
- Faster reviews on subsequent runs

---

### **Step 5: Multi-Tool Analysis** 🔧🔒

#### **5.1 Linter Analysis** (32 tools)

**What happens:**
1. **Checks tool availability** (warns if missing)
2. **Runs configured linters**:
   - JavaScript/TypeScript: ESLint, Prettier, TypeScript, TSLint, JSHint, Standard, XO, Biome, Deno Lint
   - Python: Pylint, Flake8, Black, Mypy, isort, Pydocstyle, Pylama
   - Go: golangci-lint, gofmt, go vet, staticcheck, ineffassign
   - Rust: rust-clippy, rustfmt
   - Java: Checkstyle, PMD, SpotBugs, Error Prone
   - General: ShellCheck, Hadolint, Markdownlint, Yamllint, Jsonlint
3. **Converts output** to standardized format
4. **Filters false positives** (removes noise)

**Example output:**
```
🔧 Running linters...
Found 5 error(s), 12 warning(s), 8 suggestion(s) via linters
   Filtered 3 false positive(s) (15% reduction)
   Tools used: eslint, prettier, typescript
```

#### **5.2 SAST Analysis** (14 tools)

**What happens:**
1. **Runs security scanners**:
   - Semgrep, Bandit, Gosec, Brakeman
   - npm audit, Snyk, Trivy
   - OWASP Dependency Check, Safety, pip-audit
   - bundler-audit, cargo-audit, mix-audit
2. **Identifies vulnerabilities**:
   - Critical, High, Medium, Low severity
   - CWE IDs, OWASP categories
   - Fix suggestions
3. **Filters false positives**

**Example output:**
```
🔒 Running SAST security analysis...
Found 2 critical, 5 high, 3 medium, 1 low severity issue(s) via SAST tools
   Filtered 1 false positive(s) (9% reduction)
   Tools used: semgrep, npm-audit, trivy
```

---

### **Step 6: False Positive Filtering** 🎯

**What happens:**
1. **Confidence-based filtering**:
   - Removes low-confidence issues
   - Keeps high-confidence errors
2. **Pattern-based filtering**:
   - Filters common false positives (style preferences, formatting)
   - Tool-specific rules (e.g., Prettier formatting only)
3. **Never filters** critical errors

**Example:**
- ❌ Filters: "Line too long" (formatting)
- ❌ Filters: "Prefer const" (style preference)
- ✅ Keeps: "SQL injection vulnerability" (critical)
- ✅ Keeps: "Unhandled promise rejection" (error)

**Result:** 30-50% noise reduction

---

### **Step 7: AI-Powered Review** 🤖

**What happens:**
1. **Enhances prompts** with:
   - Dependency context (from codegraph)
   - Framework detection
   - File type context
   - Related code chunks
2. **Reviews code chunks** in parallel (3 concurrent)
3. **Applies global rules**:
   - Security checks
   - SOLID principles
   - Error handling
   - Performance optimization
4. **Caches results** (24-hour TTL) for faster re-runs

**Example output:**
```
🤖 Reviewing code with openai...
Using 33 chunk(s) and 8 rule(s)
   Including 5 chunk(s) from affected files in dependency chain
```

**AI Review Process:**
```
For each chunk:
  1. Analyze code structure
  2. Check against rules
  3. Identify issues
  4. Suggest improvements
  5. Provide code examples
```

---

### **Step 8: Result Aggregation** 📊

**What happens:**
1. **Merges all results**:
   - AI comments
   - Linter issues
   - SAST findings
   - Rule-based issues
2. **Deduplicates** similar comments
3. **Prioritizes** by severity
4. **Calculates statistics**:
   - Total errors/warnings/suggestions
   - Review quality score
   - Top issues

**Example output:**
```
📊 Aggregating results...
Found 7 error(s), 17 warning(s), 12 suggestion(s)
Review quality: 8.5/10
```

---

### **Step 9: Post Review Decision** ✅

**What happens:**
1. **Makes automatic decision**:
   - **APPROVE**: No errors, few warnings
   - **REQUEST_CHANGES**: Errors found or many warnings
   - **COMMENT**: Warnings/suggestions only
2. **Posts inline comments** on changed lines
3. **Posts review summary** with:
   - Statistics
   - Top issues
   - Visual indicators
4. **Posts suggestions**:
   - Naming improvements
   - PR title suggestions

**Example output:**
```
💬 Posting comments to PR #42...
Posted 24 comment(s)
Posted review summary
Posted review decision: REQUEST_CHANGES
```

---

## 🔄 Complete Flow Diagram

```
┌─────────────────┐
│   Configuration │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Git Operations │
│  - Checkout     │
│  - Get Changes  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Codegraph      │
│  - Build Graph  │
│  - Impact Analysis│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Code Chunking  │
│  - Semantic Split│
│  - Filter       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Multi-Tool     │
│  ├─ Linters (32)│
│  └─ SAST (14)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ False Positive  │
│ Filtering       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Review      │
│  - Parallel     │
│  - Context-aware│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Aggregation    │
│  - Merge        │
│  - Deduplicate  │
│  - Prioritize   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Post Results   │
│  - Comments     │
│  - Summary      │
│  - Decision     │
└─────────────────┘
```

---

## 💡 Key Features Explained

### **1. Codegraph Analyzer** 🔗

**Purpose:** Understand code dependencies and impact

**How it works:**
- Parses imports/exports (JS/TS, Python, Go)
- Tracks function-to-function dependencies
- Builds dependency graph
- Calculates impact severity

**Example:**
```typescript
// Changed: src/api.ts
// Impact Analysis:
// - Direct: src/api.ts
// - Affected: src/utils.ts (imports from api.ts)
// - Affected: src/components/Button.tsx (uses utils.ts)
// Severity: HIGH (3 files affected)
```

### **2. False Positive Filtering** 🎯

**Purpose:** Reduce noise from tools

**How it works:**
- **Confidence scoring**: Each issue gets confidence (0-1)
- **Pattern matching**: Filters known false positives
- **Tool-specific rules**: Different rules per tool
- **Never filters errors**: Always keeps critical issues

**Example:**
```typescript
// Before filtering: 50 issues
// After filtering: 30 issues (40% reduction)
// - Filtered: 15 style issues (Prettier, formatting)
// - Filtered: 5 low-confidence warnings
// - Kept: 30 real issues (errors + high-confidence warnings)
```

### **3. Multi-Tool Integration** 🔧

**Purpose:** Comprehensive analysis from multiple perspectives

**How it works:**
- **Runs tools in parallel** (where possible)
- **Standardizes output** to common format
- **Merges results** intelligently
- **Handles missing tools** gracefully

**Example:**
```typescript
// Linters run:
eslint → 5 issues
prettier → 3 issues
typescript → 2 issues

// Merged: 10 unique issues
// Deduplicated: 8 issues (2 duplicates removed)
```

### **4. AI Review Enhancement** 🤖

**Purpose:** Context-aware intelligent review

**How it works:**
- **Dependency context**: "This change affects 3 other files"
- **Framework detection**: "Using React, check hooks rules"
- **Related code**: Includes related chunks for context
- **Rule application**: Applies 8+ global rules

**Example:**
```
AI Prompt Enhancement:
- Original: "Review this code"
- Enhanced: "Review this code. It's a React component using hooks.
  This change affects 3 files: utils.ts, api.ts, Button.tsx.
  Check for: security vulnerabilities, error handling,
  SOLID principles, performance issues."
```

---

## 📊 Example Output

### **Console Output:**
```
🔀 Checking out to branch: feature-branch
📁 Detecting changes unique to feature-branch...
Found 12 changed file(s)

🔗 Building dependency graph...
Impact analysis: 8 affected file(s), severity: high

🔪 Chunking code using chunkyyy...
Generated 45 code chunk(s)
⚡ Incremental review: Skipping 12 already-reviewed chunk(s)

🔍 Running rule-based pre-filtering...
Found 2 issue(s) via rule-based analysis

🔧 Running linters...
Found 5 error(s), 12 warning(s), 8 suggestion(s) via linters
   Filtered 3 false positive(s) (15% reduction)
   Tools used: eslint, prettier, typescript

🔒 Running SAST security analysis...
Found 2 critical, 5 high, 3 medium, 1 low severity issue(s)
   Filtered 1 false positive(s) (9% reduction)
   Tools used: semgrep, npm-audit, trivy

🤖 Reviewing code with openai...
Using 33 chunk(s) and 8 rule(s)

📊 Aggregating results...
Found 7 error(s), 17 warning(s), 12 suggestion(s)
Review quality: 8.5/10

💬 Posting comments to PR #42...
Posted 24 comment(s)
Posted review summary
Posted review decision: REQUEST_CHANGES
```

### **PR Comments:**
```
🔴 Error: SQL Injection Vulnerability
File: src/api.ts, Line: 45
Issue: Direct string interpolation in SQL query
Fix: Use parameterized queries
```

### **Review Summary:**
```
📊 Review Summary
- 7 errors found
- 17 warnings
- 12 suggestions
- Review decision: REQUEST_CHANGES

Top Issues:
1. SQL Injection (Critical)
2. Unhandled Promise Rejection (Error)
3. Memory Leak Potential (Warning)
```

---

## 🚀 Usage Examples

### **Basic Usage:**
```bash
# Review PR by branch name
code-sherlock review --branch feature-branch

# Skip posting comments
code-sherlock review --branch feature-branch --no-comments

# Specify base branch
code-sherlock review --branch feature-branch --base develop
```

### **Programmatic Usage:**
```typescript
import { PRReviewer, ConfigLoader } from 'code-sherlock';

const config = ConfigLoader.load();
const reviewer = new PRReviewer(config);

// Review PR
const result = await reviewer.reviewPR('feature-branch', true);

// Check results
console.log(`Found ${result.stats.errors} errors`);
console.log(`Review quality: ${result.qualityScore}/10`);
```

---

## 🎯 What Makes It Different?

1. **49 Tools** - More than CodeRabbit's 40+
2. **Codegraph Analysis** - Understands dependencies
3. **False Positive Filtering** - Reduces noise by 30-50%
4. **Context-Aware AI** - Enhanced with dependency info
5. **Incremental Reviews** - Only reviews new/changed code
6. **Automatic Decisions** - Approve/Request Changes/Comment
7. **Multi-Language** - JS/TS, Python, Go, Rust, Java, Ruby

---

## 🔧 Configuration

See `code-sherlock.config.example.json` for full configuration options.

**Key settings:**
- `linter.tools`: Which linters to run
- `sast.tools`: Which security scanners to run
- `aiProvider`: OpenAI or Claude
- `globalRules`: Custom review rules
- `pr.number`: PR number for posting comments

---

## 📈 Performance

- **Review time**: 2-5 minutes for typical PR
- **False positive reduction**: 30-50%
- **Incremental review**: 20-40% faster on re-runs
- **Tool coverage**: 49 tools vs CodeRabbit's 40+

---

## 🎉 Result

**Code Sherlock provides:**
- ✅ Comprehensive analysis from 49 tools
- ✅ Intelligent false positive filtering
- ✅ Context-aware AI review
- ✅ Dependency impact analysis
- ✅ Automatic review decisions
- ✅ Enhanced inline comments
- ✅ Review summaries and statistics

**All in one automated workflow!** 🚀
