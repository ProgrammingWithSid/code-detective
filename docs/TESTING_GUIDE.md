# Testing Guide for Code Sherlock Features

## 🧪 Testing Overview

This guide covers how to test all the new features:
- ✅ 49 Tools Integration (32 linters + 14 SAST + 3 analyzers)
- ✅ Codegraph Analyzer
- ✅ False Positive Filtering
- ✅ Enhanced PR Comments
- ✅ Review Decisions

---

## 📋 Quick Start Testing

### **1. Basic Setup**

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

---

## 🧪 Unit Testing

### **Test Individual Components**

#### **Test Codegraph Analyzer**

```bash
# Run codegraph tests
npm test -- codegraph

# Or use the pre-made test file
npx tsx test-codegraph.ts

# Or create your own test file
cat > test-codegraph.ts << 'EOF'
import { createCodegraphAnalyzer } from './src/analyzers/codegraph-analyzer';
import { ChangedFile } from './src/types';

async function testCodegraph() {
  const analyzer = createCodegraphAnalyzer({ rootDir: './src' });
  const files = ['src/reviewer.ts', 'src/git.ts'];
  await analyzer.buildGraph(files);

  const changedFiles: ChangedFile[] = [
    { path: 'src/reviewer.ts', additions: 10, deletions: 5, status: 'modified' }
  ];
  const impact = analyzer.analyzeImpact(changedFiles);

  console.log('Impact:', impact);
  console.log('Affected files:', impact.affectedFiles);
  console.log('Severity:', impact.severity);
}

testCodegraph().catch(console.error);
EOF

npx tsx test-codegraph.ts
```

#### **Test False Positive Filter**

```bash
# Use the pre-made test file
npx tsx test-filter.ts

# Or create your own test file
cat > test-filter.ts << 'EOF'
import { createFalsePositiveFilter } from './src/analyzers/false-positive-filter';
import { ReviewComment } from './src/types';

function testFilter() {
  const filter = createFalsePositiveFilter({
    minConfidence: 0.5,
    enableToolFiltering: true,
    enablePatternFiltering: true,
  });

  const comments: ReviewComment[] = [
    {
      file: 'test.ts',
      line: 10,
      body: 'Prefer const over let',
      severity: 'suggestion',
      category: 'style',
    },
    {
      file: 'test.ts',
      line: 20,
      body: 'SQL injection vulnerability',
      severity: 'error',
      category: 'security',
    },
  ];

  const { filtered, stats } = filter.filterReviewComments(comments);
  console.log('Filtered:', filtered.length);
  console.log('Stats:', stats);
}

testFilter();
EOF

npx tsx test-filter.ts
```

#### **Test Linter Integration**

```bash
# Create test file
cat > test-linter.ts << 'EOF'
import { createLinterIntegration } from './src/analyzers/linter-integration';

async function testLinter() {
  const linter = createLinterIntegration({
    enabled: true,
    tools: ['eslint', 'prettier'],
    workingDir: process.cwd(),
  });

  const files = [
    { path: 'src/reviewer.ts', content: 'const x = 1;' },
  ];

  const result = await linter.analyze(files);
  console.log('Issues:', result.issues.length);
  console.log('Tools used:', result.toolsUsed);
  console.log('Summary:', result.summary);
}

testLinter().catch(console.error);
EOF

npx tsx test-linter.ts
```

#### **Test SAST Integration**

```bash
# Create test file
cat > test-sast.ts << 'EOF'
import { createSASTIntegration } from './src/analyzers/sast-integration';

async function testSAST() {
  const sast = createSASTIntegration({
    enabled: true,
    tools: ['semgrep', 'npm-audit'],
    workingDir: process.cwd(),
  });

  const files = [
    { path: 'package.json', content: '{"dependencies": {}}' },
  ];

  const result = await sast.analyze(files);
  console.log('Issues:', result.issues.length);
  console.log('Tools used:', result.toolsUsed);
  console.log('Summary:', result.summary);
}

testSAST().catch(console.error);
EOF

npx tsx test-sast.ts
```

---

## 🔧 Integration Testing

### **Test Full Review Flow**

#### **1. Create Test Repository**

```bash
# Create a test repo
mkdir test-repo && cd test-repo
git init
git checkout -b feature-branch

# Create test files
cat > test.js << 'EOF'
const x = 1;
let y = 2; // Should suggest const
console.log("test"); // Should flag no-console

function test() {
  return x + y;
}
EOF

cat > package.json << 'EOF'
{
  "name": "test-repo",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "^4.17.21"
  }
}
EOF

git add .
git commit -m "Initial commit"
git checkout -b test-feature
echo "const z = 3;" >> test.js
git add test.js
git commit -m "Add feature"
```

#### **2. Create Test Config**

```bash
cat > code-sherlock.config.json << 'EOF'
{
  "aiProvider": "openai",
  "openai": {
    "apiKey": "your-key-here",
    "model": "gpt-4-turbo-preview"
  },
  "linter": {
    "enabled": true,
    "tools": ["eslint", "prettier"]
  },
  "sast": {
    "enabled": true,
    "tools": ["npm-audit"]
  },
  "repository": {
    "owner": "test",
    "repo": "test-repo",
    "baseBranch": "main"
  }
}
EOF
```

#### **3. Run Review**

```bash
# From code-detective directory
cd /path/to/code-detective

# Review the test branch
npm run build
node dist/cli.js review --branch test-feature --repo /path/to/test-repo --no-comments
```

---

## 🎯 Feature-Specific Testing

### **1. Test Codegraph Analyzer**

```typescript
// test-codegraph-integration.ts
import { createCodegraphAnalyzer } from './src/analyzers/codegraph-analyzer';
import { ChangedFile } from './src/types';

async function testCodegraph() {
  const analyzer = createCodegraphAnalyzer({
    rootDir: './src',
    maxDepth: 5,
    analyzeInternal: true,
  });

  // Build graph
  const files = [
    'src/reviewer.ts',
    'src/git.ts',
    'src/chunker.ts',
    'src/ai-provider.ts',
  ];

  await analyzer.buildGraph(files);
  console.log('✅ Graph built');

  // Test impact analysis
  const changedFiles: ChangedFile[] = [
    {
      path: 'src/reviewer.ts',
      additions: 50,
      deletions: 10,
      status: 'modified',
    },
  ];

  const impact = analyzer.analyzeImpact(changedFiles);
  console.log('Impact Analysis:');
  console.log('- Affected files:', impact.affectedFiles.length);
  console.log('- Dependency files:', impact.dependencyFiles.length);
  console.log('- Impact chain:', impact.impactChain.length);
  console.log('- Severity:', impact.severity);

  // Test dependencies
  const deps = analyzer.getDependencies('src/reviewer.ts');
  console.log('\nDependencies for reviewer.ts:');
  console.log('- Imports:', deps.imports.length);
  console.log('- Exports:', deps.exports.length);
  console.log('- File deps:', deps.fileDeps.length);
  console.log('- Internal deps:', deps.internalDeps.length);

  // Test visualization
  const diagram = analyzer.generateVisualization(['src/reviewer.ts', 'src/git.ts']);
  console.log('\nMermaid Diagram:');
  console.log(diagram);
}

testCodegraph().catch(console.error);
```

### **2. Test False Positive Filtering**

```typescript
// test-filtering.ts
import { createFalsePositiveFilter } from './src/analyzers/false-positive-filter';
import { ReviewComment } from './src/types';

function testFalsePositiveFilter() {
  const filter = createFalsePositiveFilter({
    minConfidence: 0.5,
    enableToolFiltering: true,
    enablePatternFiltering: true,
    customPatterns: [
      {
        pattern: /test-pattern/i,
        reason: 'Test pattern',
        confidenceThreshold: 0.3,
      },
    ],
  });

  const comments: ReviewComment[] = [
    // Should be filtered (style preference)
    {
      file: 'test.ts',
      line: 10,
      body: 'Prefer const over let',
      severity: 'suggestion',
      category: 'style',
    },
    // Should be filtered (formatting)
    {
      file: 'test.ts',
      line: 20,
      body: 'Line too long (120 characters)',
      severity: 'warning',
      category: 'formatting',
    },
    // Should NOT be filtered (error)
    {
      file: 'test.ts',
      line: 30,
      body: 'SQL injection vulnerability',
      severity: 'error',
      category: 'security',
    },
    // Should NOT be filtered (high confidence)
    {
      file: 'test.ts',
      line: 40,
      body: 'Unhandled promise rejection',
      severity: 'error',
      category: 'bug',
    },
  ];

  const { filtered, stats } = filter.filterReviewComments(comments);

  console.log('Original comments:', comments.length);
  console.log('Filtered comments:', filtered.length);
  console.log('Filtered out:', stats.filteredIssues);
  console.log('Filter rate:', `${Math.round(stats.filterRate * 100)}%`);
  console.log('\nRemaining comments:');
  filtered.forEach((c) => {
    console.log(`- ${c.severity}: ${c.body}`);
  });
}

testFalsePositiveFilter();
```

### **3. Test Tool Integration**

```typescript
// test-tools.ts
import { ToolChecker } from './src/analyzers/tool-checker';

async function testToolChecker() {
  // Check linter tools
  const linterTools = ['eslint', 'prettier', 'typescript', 'flake8', 'black'];
  const linterCheck = await ToolChecker.checkLinterTools(linterTools);
  console.log('Linter Tools Check:');
  console.log('- All available:', linterCheck.allAvailable);
  console.log('- Available:', linterCheck.available);
  console.log('- Missing:', linterCheck.missing);
  console.log(ToolChecker.formatCheckResults(linterCheck));

  // Check SAST tools
  const sastTools = ['semgrep', 'bandit', 'npm-audit', 'trivy'];
  const sastCheck = await ToolChecker.checkSASTTools(sastTools);
  console.log('\nSAST Tools Check:');
  console.log('- All available:', sastCheck.allAvailable);
  console.log('- Available:', sastCheck.available);
  console.log('- Missing:', sastCheck.missing);
  console.log(ToolChecker.formatCheckResults(sastCheck));
}

testToolChecker().catch(console.error);
```

---

## 🚀 End-to-End Testing

### **Test Complete Review Flow**

#### **Step 1: Setup Test Repository**

```bash
#!/bin/bash
# setup-test-repo.sh

REPO_DIR="test-review-repo"
rm -rf $REPO_DIR
mkdir $REPO_DIR && cd $REPO_DIR

git init
git checkout -b main

# Create initial files
cat > src/index.ts << 'EOF'
export function hello(name: string): string {
  return `Hello, ${name}!`;
}
EOF

cat > package.json << 'EOF'
{
  "name": "test-repo",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "^4.17.21"
  }
}
EOF

git add .
git commit -m "Initial commit"

# Create feature branch
git checkout -b feature/add-logging

# Add changes
cat > src/logger.ts << 'EOF'
export function log(message: string) {
  console.log(message); // ESLint: no-console
}

export function logError(error: Error) {
  console.error(error); // ESLint: no-console
}
EOF

# Modify existing file
cat >> src/index.ts << 'EOF'

export function goodbye(name: string): string {
  let message = `Goodbye, ${name}!`; // Should suggest const
  return message;
}
EOF

git add .
git commit -m "Add logging feature"
```

#### **Step 2: Run Review**

```bash
# From code-detective directory
cd /path/to/code-detective

# Build first
npm run build

# Run review
node dist/cli.js review \
  --branch feature/add-logging \
  --repo /path/to/test-review-repo \
  --base main \
  --no-comments
```

#### **Step 3: Verify Output**

Expected output should show:
- ✅ Codegraph analysis
- ✅ Linter results (ESLint, Prettier)
- ✅ False positive filtering stats
- ✅ Review summary
- ✅ Review decision

---

## 📊 Testing Checklist

### **Codegraph Analyzer**
- [ ] Builds dependency graph successfully
- [ ] Identifies affected files correctly
- [ ] Calculates impact severity (high/medium/low)
- [ ] Generates Mermaid diagrams
- [ ] Handles missing files gracefully
- [ ] Works with multiple languages (JS/TS, Python, Go)

### **False Positive Filtering**
- [ ] Filters style preferences (Prettier, formatting)
- [ ] Filters low-confidence issues
- [ ] Never filters errors
- [ ] Never filters high-confidence security issues
- [ ] Provides filtering statistics
- [ ] Works with custom patterns

### **Linter Integration**
- [ ] Runs configured linters
- [ ] Handles missing tools gracefully
- [ ] Converts output to standard format
- [ ] Works with multiple linters simultaneously
- [ ] Provides tool usage statistics

### **SAST Integration**
- [ ] Runs configured SAST tools
- [ ] Identifies security vulnerabilities
- [ ] Maps severity correctly (critical/high/medium/low)
- [ ] Provides CWE IDs and OWASP categories
- [ ] Handles missing tools gracefully

### **Review Decisions**
- [ ] Approves when no errors found
- [ ] Requests changes when errors found
- [ ] Comments when warnings/suggestions only
- [ ] Posts inline comments correctly
- [ ] Posts review summary

---

## 🐛 Debugging Tips

### **Enable Verbose Logging**

```typescript
// Add to your test
process.env.DEBUG = 'code-sherlock:*';
```

### **Check Tool Availability**

```bash
# Check if tools are installed
which eslint
which prettier
which semgrep
which bandit

# Check npm packages
npm list -g code-sherlock
```

### **Test Individual Components**

```typescript
// Test just codegraph
import { createCodegraphAnalyzer } from './src/analyzers/codegraph-analyzer';
const analyzer = createCodegraphAnalyzer({ rootDir: './src' });
// ... test code

// Test just filtering
import { createFalsePositiveFilter } from './src/analyzers/false-positive-filter';
const filter = createFalsePositiveFilter();
// ... test code
```

---

## 📝 Example Test Scenarios

### **Scenario 1: Test with Real PR**

```bash
# Clone a real repository
git clone https://github.com/your-org/your-repo.git
cd your-repo

# Create a test branch
git checkout -b test-code-sherlock

# Make some changes
echo "const test = 1;" >> test.js

# Run review
code-sherlock review --branch test-code-sherlock --no-comments
```

### **Scenario 2: Test False Positive Filtering**

```typescript
// Create test with known false positives
const comments = [
  { body: 'Prefer const', severity: 'suggestion' }, // Should filter
  { body: 'Line too long', severity: 'warning' }, // Should filter
  { body: 'SQL injection', severity: 'error' }, // Should NOT filter
];

const { filtered } = filter.filterReviewComments(comments);
console.assert(filtered.length === 1, 'Should only keep error');
console.assert(filtered[0].body === 'SQL injection', 'Should keep error');
```

### **Scenario 3: Test Codegraph Impact**

```typescript
// Test impact analysis
const changedFiles = [{ path: 'src/api.ts', additions: 10, deletions: 5 }];
const impact = analyzer.analyzeImpact(changedFiles);

// Should identify files that import from api.ts
console.assert(impact.affectedFiles.length > 0, 'Should find affected files');
console.assert(impact.severity === 'high' || impact.severity === 'medium', 'Should calculate severity');
```

---

## ✅ Expected Results

### **Successful Review Output**

```
🔀 Checking out to branch: feature-branch
📁 Detecting changes unique to feature-branch...
Found 5 changed file(s)

🔗 Building dependency graph...
Impact analysis: 8 affected file(s), severity: high

🔪 Chunking code using chunkyyy...
Generated 12 code chunk(s)

🔍 Running rule-based pre-filtering...
Found 2 issue(s) via rule-based analysis

🔧 Running linters...
Found 3 error(s), 8 warning(s), 5 suggestion(s) via linters
   Filtered 2 false positive(s) (12% reduction)
   Tools used: eslint, prettier, typescript

🔒 Running SAST security analysis...
Found 1 critical, 2 high, 1 medium, 0 low severity issue(s) via SAST tools
   Filtered 0 false positive(s) (0% reduction)
   Tools used: semgrep, npm-audit

🤖 Reviewing code with openai...
Using 10 chunk(s) and 8 rule(s)

📊 Aggregating results...
Found 4 error(s), 10 warning(s), 5 suggestion(s)
Review quality: 8.5/10
```

---

## 🎯 Quick Test Commands

```bash
# Test codegraph
npm test -- codegraph

# Test filtering
npm test -- false-positive

# Test linter integration
npm test -- linter

# Test SAST integration
npm test -- sast

# Test full review
npm test -- reviewer

# Run all tests
npm test
```

---

## 📚 Additional Resources

- **Unit Tests**: `__tests__/` directory
- **Examples**: `examples/` directory
- **Documentation**: `docs/` directory

---

## 🚨 Common Issues

### **Issue: Tools not found**
**Solution**: Install missing tools or configure `ignoreMissingTools: true`

### **Issue: False positives not filtered**
**Solution**: Adjust `minConfidence` or add custom patterns

### **Issue: Codegraph not working**
**Solution**: Check file paths and ensure files exist

---

**Happy Testing!** 🎉
