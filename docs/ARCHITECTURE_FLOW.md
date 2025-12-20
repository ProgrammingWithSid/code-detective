# Code Sherlock - Architecture Flow

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Components](#core-components)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [Review Workflows](#review-workflows)
5. [Integration Flows](#integration-flows)
6. [Storage & Caching](#storage--caching)
7. [AI Orchestration](#ai-orchestration)
8. [Error Handling](#error-handling)
9. [Extension Points](#extension-points)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CODE SHERLOCK                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    CLI      │  │  GitHub     │  │   GitLab    │  │ Programmatic│        │
│  │  Interface  │  │   Action    │  │   CI/CD     │  │     API     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│                          ┌────────┴────────┐                                │
│                          │  Entry Router   │                                │
│                          └────────┬────────┘                                │
│                                   │                                          │
│  ┌────────────────────────────────┼────────────────────────────────┐       │
│  │                                │                                │       │
│  │  ┌──────────────┐    ┌────────┴────────┐    ┌──────────────┐   │       │
│  │  │   Config     │    │   PR Reviewer   │    │   Security   │   │       │
│  │  │   Loader     │    │                 │    │   Analyzer   │   │       │
│  │  └──────────────┘    └────────┬────────┘    └──────────────┘   │       │
│  │                               │                                 │       │
│  │                      ┌────────┴────────┐                       │       │
│  │                      │ Context Engine  │                       │       │
│  │                      └────────┬────────┘                       │       │
│  │                               │                                 │       │
│  │  ┌──────────────┐    ┌────────┴────────┐    ┌──────────────┐   │       │
│  │  │    Code      │    │  AI Orchestrator│    │  Performance │   │       │
│  │  │   Chunker    │◄───┤                 │───►│   Analyzer   │   │       │
│  │  └──────────────┘    └────────┬────────┘    └──────────────┘   │       │
│  │                               │                                 │       │
│  │                      ┌────────┴────────┐                       │       │
│  │                      │  Multi-Model    │                       │       │
│  │                      │  Providers      │                       │       │
│  │                      └────────┬────────┘                       │       │
│  └───────────────────────────────┼─────────────────────────────────┘       │
│                                  │                                          │
│  ┌───────────────────────────────┼─────────────────────────────────┐       │
│  │         ┌─────────────────────┼─────────────────────┐           │       │
│  │         │                     │                     │           │       │
│  │   ┌─────┴─────┐         ┌─────┴─────┐         ┌─────┴─────┐    │       │
│  │   │  OpenAI   │         │  Claude   │         │  Ollama   │    │       │
│  │   │ (GPT-4)   │         │ (Claude)  │         │  (Local)  │    │       │
│  │   └───────────┘         └───────────┘         └───────────┘    │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                        OUTPUT LAYER                              │       │
│  │                                                                  │       │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │       │
│  │  │   GitHub     │  │   Console    │  │    JSON      │           │       │
│  │  │  Comments    │  │   Output     │  │   Export     │           │       │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Component Hierarchy

```
code-sherlock/
├── Entry Points
│   ├── CLI (src/cli/)
│   ├── Programmatic API (src/index.ts)
│   └── GitHub Actions (.github/actions/)
│
├── Core Services
│   ├── PRReviewer (src/reviewer.ts)
│   ├── IncrementalReviewer (src/core/incremental-reviewer.ts)
│   └── GitService (src/git.ts)
│
├── AI Layer
│   ├── AIProvider (src/ai-provider.ts)
│   ├── OllamaProvider (src/ai-provider/ollama-provider.ts)
│   ├── ModelOrchestrator (src/orchestration/)
│   └── ConsensusMerger (src/orchestration/consensus-merger.ts)
│
├── Context Engine
│   ├── CodeContextBuilder (src/context/code-context-builder.ts)
│   ├── PRContextAnalyzer (src/context/pr-context-analyzer.ts)
│   ├── RepoContextLearner (src/context/repo-context-learner.ts)
│   └── UnifiedContextEngine (src/context/unified-context.ts)
│
├── Analyzers
│   ├── SecurityAnalyzer (src/analyzers/security-analyzer.ts)
│   ├── PerformanceAnalyzer (src/analyzers/performance-analyzer.ts)
│   └── ChunkService (src/chunker.ts)
│
├── Auto-Fix System
│   ├── FixGenerator (src/autofix/fix-generator.ts)
│   ├── FixApplier (src/autofix/fix-applier.ts)
│   └── AutoFixService (src/autofix/autofix-service.ts)
│
├── Storage Layer
│   ├── MemoryAdapter (src/storage/adapters/memory-adapter.ts)
│   ├── FileAdapter (src/storage/adapters/file-adapter.ts)
│   ├── RedisAdapter (src/storage/adapters/redis-adapter.ts)
│   └── ReviewCache (src/storage/review-cache.ts)
│
├── Integration Layer
│   ├── PRCommentService (src/pr-comments.ts)
│   ├── WebhookHandler (src/integrations/github/webhook-handler.ts)
│   └── WebhookServer (src/api/webhook-server.ts)
│
└── Output Layer
    ├── SummaryBuilder (src/feedback/summary-builder.ts)
    ├── DiagramGenerator (src/feedback/diagram-generator.ts)
    └── Formatters
```

---

## Data Flow Diagrams

### 1. PR Review Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PR REVIEW FLOW                                  │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │  PR Event   │
                    │  (Webhook/  │
                    │   CLI/API)  │
                    └──────┬──────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   Load Configuration   │
              │   - API keys           │
              │   - Review settings    │
              │   - File filters       │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │    Fetch PR Data       │
              │   - Changed files      │
              │   - PR metadata        │
              │   - Commit history     │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   Check Cache          │
              │   (Incremental Mode)   │
              └───────────┬────────────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │  Cached    │ │  Changed   │ │    New     │
    │   Files    │ │   Files    │ │   Files    │
    │  (Skip)    │ │  (Review)  │ │  (Review)  │
    └────────────┘ └─────┬──────┘ └─────┬──────┘
                         │              │
                         └──────┬───────┘
                                │
                                ▼
              ┌────────────────────────┐
              │   Code Chunking        │
              │   (AST-based parsing)  │
              │   - Functions          │
              │   - Classes            │
              │   - Methods            │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   Build Context        │
              │   - Code context       │
              │   - PR context         │
              │   - Repo context       │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   AI Review            │
              │   - Send to AI         │
              │   - Parse response     │
              │   - Validate issues    │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   Post-Processing      │
              │   - Filter duplicates  │
              │   - Map to lines       │
              │   - Generate fixes     │
              └───────────┬────────────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │   Post     │ │   Return   │ │   Update   │
    │ Comments   │ │   Result   │ │   Cache    │
    └────────────┘ └────────────┘ └────────────┘
```

### 2. Security Analysis Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SECURITY ANALYSIS FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │  Input      │
                    │  (Files/    │
                    │   Content)  │
                    └──────┬──────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   File Discovery       │
              │   - Glob patterns      │
              │   - Exclude patterns   │
              │   - Language detection │
              └───────────┬────────────┘
                          │
                          ▼
        ┌─────────────────┴─────────────────┐
        │         Security Checks            │
        │                                    │
        │  ┌──────────────────────────────┐ │
        │  │  Pattern-Based Detection     │ │
        │  │  - Regex patterns            │ │
        │  │  - Known vulnerabilities     │ │
        │  │  - CWE mappings              │ │
        │  └──────────────────────────────┘ │
        │                                    │
        │  ┌──────────────────────────────┐ │
        │  │  Checks Performed:           │ │
        │  │  ├── SQL Injection           │ │
        │  │  ├── XSS (Cross-Site Script) │ │
        │  │  ├── Hardcoded Secrets       │ │
        │  │  ├── Weak Cryptography       │ │
        │  │  ├── Path Traversal          │ │
        │  │  ├── Command Injection       │ │
        │  │  ├── SSRF                    │ │
        │  │  ├── Insecure Deserialize    │ │
        │  │  ├── CORS Misconfiguration   │ │
        │  │  └── JWT Issues              │ │
        │  └──────────────────────────────┘ │
        └─────────────────┬─────────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   Issue Aggregation    │
              │   - Severity scoring   │
              │   - Deduplication      │
              │   - Context enrichment │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   Report Generation    │
              │   - SARIF format       │
              │   - JSON format        │
              │   - Markdown format    │
              └───────────┬────────────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │   GitHub   │ │  Console   │ │   CI/CD    │
    │  Security  │ │   Output   │ │  Artifact  │
    │    Tab     │ │            │ │            │
    └────────────┘ └────────────┘ └────────────┘
```

### 3. Multi-Model Orchestration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MULTI-MODEL ORCHESTRATION FLOW                        │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │  Code to    │
                    │   Review    │
                    └──────┬──────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   Strategy Selection   │
              │   ┌──────────────────┐ │
              │   │ • parallel       │ │
              │   │ • sequential     │ │
              │   │ • fallback       │ │
              │   │ • cascade        │ │
              │   │ • ensemble       │ │
              │   └──────────────────┘ │
              └───────────┬────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │   Model 1  │  │   Model 2  │  │   Model 3  │
   │  (OpenAI)  │  │  (Claude)  │  │  (Ollama)  │
   │            │  │            │  │            │
   │ weight:1.0 │  │ weight:1.0 │  │ weight:0.8 │
   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
         │               │               │
         │    Reviews    │    Reviews    │
         │               │               │
         ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  Comments  │  │  Comments  │  │  Comments  │
   │  Model 1   │  │  Model 2   │  │  Model 3   │
   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
              ┌────────────────────────┐
              │   Consensus Merger     │
              │                        │
              │  ┌──────────────────┐  │
              │  │ Similarity Calc  │  │
              │  │ (Message, File,  │  │
              │  │  Line matching)  │  │
              │  └──────────────────┘  │
              │                        │
              │  ┌──────────────────┐  │
              │  │ Consensus Rules  │  │
              │  │ - unanimous      │  │
              │  │ - majority       │  │
              │  │ - weighted avg   │  │
              │  └──────────────────┘  │
              │                        │
              │  ┌──────────────────┐  │
              │  │ Conflict Resolve │  │
              │  │ - severity boost │  │
              │  │ - confidence     │  │
              │  └──────────────────┘  │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   Merged Result        │
              │   - Consensus comments │
              │   - Agreement scores   │
              │   - Model breakdown    │
              └────────────────────────┘
```

### 4. Context Engine Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       CONTEXT ENGINE FLOW                                │
└─────────────────────────────────────────────────────────────────────────┘

         ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
         │    Code     │         │     PR      │         │    Repo     │
         │   Content   │         │   Metadata  │         │   History   │
         └──────┬──────┘         └──────┬──────┘         └──────┬──────┘
                │                       │                       │
                ▼                       ▼                       ▼
     ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
     │  Code Context    │    │   PR Context     │    │  Repo Context    │
     │    Builder       │    │    Analyzer      │    │    Learner       │
     └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
              │                       │                       │
              │                       │                       │
     ┌────────┴────────┐    ┌────────┴────────┐    ┌────────┴────────┐
     │ • AST parsing   │    │ • PR description│    │ • Style guide   │
     │ • Dependencies  │    │ • Linked issues │    │ • Patterns      │
     │ • Complexity    │    │ • Author info   │    │ • Conventions   │
     │ • Functions     │    │ • Labels        │    │ • Team prefs    │
     │ • Classes       │    │ • Change stats  │    │ • Tech stack    │
     └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────┐
                       │    Unified Context       │
                       │                          │
                       │  ┌────────────────────┐  │
                       │  │ Code Contexts Map  │  │
                       │  │ (per file)         │  │
                       │  └────────────────────┘  │
                       │                          │
                       │  ┌────────────────────┐  │
                       │  │ PR Context         │  │
                       │  │ (global)           │  │
                       │  └────────────────────┘  │
                       │                          │
                       │  ┌────────────────────┐  │
                       │  │ Repo Context       │  │
                       │  │ (learned)          │  │
                       │  └────────────────────┘  │
                       └──────────────┬───────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │  AI Review   │  │   Enhanced   │  │   Learning   │
          │  Prompts     │  │   Comments   │  │   Store      │
          └──────────────┘  └──────────────┘  └──────────────┘
```

### 5. Auto-Fix Generation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AUTO-FIX GENERATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │   Review    │
                    │  Comments   │
                    └──────┬──────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   Fix Generator        │
              │                        │
              │  ┌──────────────────┐  │
              │  │ Pattern Matching │  │
              │  │ - Known patterns │  │
              │  │ - Heuristics     │  │
              │  └──────────────────┘  │
              │                        │
              │  ┌──────────────────┐  │
              │  │ AI Generation    │  │
              │  │ - Context-aware  │  │
              │  │ - Code-aware     │  │
              │  └──────────────────┘  │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   Fix Suggestions      │
              │   - filePath           │
              │   - originalCode       │
              │   - fixedCode          │
              │   - confidence         │
              │   - strategy           │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │   Validation           │
              │   - Syntax check       │
              │   - Conflict detect    │
              │   - Confidence filter  │
              └───────────┬────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
  ┌────────────┐   ┌────────────┐   ┌────────────┐
  │   Apply    │   │  Preview   │   │   Skip     │
  │   Fix      │   │   (Diff)   │   │   (Low     │
  │            │   │            │   │ Confidence)│
  └─────┬──────┘   └─────┬──────┘   └────────────┘
        │                │
        ▼                ▼
  ┌────────────┐   ┌────────────┐
  │  Backup    │   │  Generate  │
  │  Original  │   │   Diff     │
  └─────┬──────┘   └────────────┘
        │
        ▼
  ┌────────────┐
  │  Write     │
  │  Fixed     │
  │  File      │
  └────────────┘
```

---

## Review Workflows

### Case 1: New PR (Full Review)

```
Trigger: PR Opened
├── Check: Is this a new PR? → Yes
├── Action: Full file review
│   ├── Fetch all changed files
│   ├── Chunk all code
│   ├── Send to AI
│   └── Generate comments
├── Cache: Store file hashes
└── Output: Post all comments
```

### Case 2: PR Updated (Incremental Review)

```
Trigger: PR Synchronized
├── Check: Cache exists? → Yes
├── Action: Delta analysis
│   ├── Compare file hashes
│   ├── Identify changed files only
│   ├── Review only changed files
│   └── Merge with cached results
├── Cache: Update changed file hashes
└── Output: Post new comments only
```

### Case 3: PR Comment (@sherlock command)

```
Trigger: Issue Comment Created
├── Check: Contains @sherlock? → Yes
├── Parse: Extract command
│   ├── @sherlock explain <code>
│   ├── @sherlock test <function>
│   ├── @sherlock review <file>
│   ├── @sherlock ignore <rule>
│   └── @sherlock config <setting>
├── Execute: Run command handler
└── Output: Reply with result
```

### Case 4: Scheduled Security Scan

```
Trigger: Cron Schedule
├── Action: Full repository scan
│   ├── Discover all code files
│   ├── Run security checks
│   ├── Aggregate issues
│   └── Generate SARIF report
├── Output: Upload to GitHub Security
└── Notify: Alert on critical issues
```

### Case 5: PR Merge (Learning)

```
Trigger: PR Merged
├── Action: Learn from feedback
│   ├── Collect resolved vs unresolved
│   ├── Track acceptance rate
│   ├── Update pattern confidence
│   └── Store in learning store
└── Output: Update repo context
```

---

## Integration Flows

### GitHub Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       GITHUB INTEGRATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

  GitHub                           Code Sherlock
    │                                    │
    │  PR Opened/Synchronized            │
    ├──────────────────────────────────►│
    │  (Webhook Event)                   │
    │                                    │
    │                        ┌───────────┴───────────┐
    │                        │ Verify webhook sig    │
    │                        │ Parse event payload   │
    │                        │ Determine action      │
    │                        └───────────┬───────────┘
    │                                    │
    │                        ┌───────────┴───────────┐
    │                        │ Fetch PR details      │
    │                        │ GET /repos/:owner/    │
    │                        │     :repo/pulls/:pr   │
    │                        └───────────┬───────────┘
    │  PR Details Response               │
    │◄──────────────────────────────────┤
    │                                    │
    │                        ┌───────────┴───────────┐
    │                        │ Fetch changed files   │
    │                        │ GET /repos/:owner/    │
    │                        │     :repo/pulls/:pr/  │
    │                        │     files             │
    │                        └───────────┬───────────┘
    │  Files Response                    │
    │◄──────────────────────────────────┤
    │                                    │
    │                        ┌───────────┴───────────┐
    │                        │ Perform review        │
    │                        │ (AI analysis)         │
    │                        └───────────┬───────────┘
    │                                    │
    │  Create Review                     │
    │◄──────────────────────────────────┤
    │  POST /repos/:owner/:repo/        │
    │       pulls/:pr/reviews           │
    │                                    │
    │  Review Created                    │
    ├──────────────────────────────────►│
    │                                    │
```

### GitLab Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       GITLAB INTEGRATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

  GitLab                           Code Sherlock
    │                                    │
    │  MR Opened/Updated                 │
    ├──────────────────────────────────►│
    │  (Webhook Event)                   │
    │                                    │
    │                        ┌───────────┴───────────┐
    │                        │ Verify webhook token  │
    │                        │ Parse MR payload      │
    │                        └───────────┬───────────┘
    │                                    │
    │                        ┌───────────┴───────────┐
    │                        │ Fetch MR changes      │
    │                        │ GET /api/v4/projects/ │
    │                        │     :id/merge_requests│
    │                        │     /:mr/changes      │
    │                        └───────────┬───────────┘
    │  Changes Response                  │
    │◄──────────────────────────────────┤
    │                                    │
    │                        ┌───────────┴───────────┐
    │                        │ Perform review        │
    │                        └───────────┬───────────┘
    │                                    │
    │  Create Discussion                 │
    │◄──────────────────────────────────┤
    │  POST /api/v4/projects/:id/       │
    │       merge_requests/:mr/         │
    │       discussions                 │
    │                                    │
```

---

## Storage & Caching

### Storage Adapter Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       STORAGE ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   StorageAdapter    │
                    │     Interface       │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │    Memory     │   │     File      │   │     Redis     │
   │    Adapter    │   │    Adapter    │   │    Adapter    │
   │               │   │               │   │               │
   │ - LRU cache   │   │ - JSON file   │   │ - Distributed │
   │ - TTL support │   │ - Debounced   │   │ - TTL support │
   │ - Fast        │   │   writes      │   │ - Scalable    │
   └───────────────┘   └───────────────┘   └───────────────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    ReviewCache      │
                    │                     │
                    │ - Get/Save reviews  │
                    │ - File hash tracking│
                    │ - Comment resolution│
                    │ - Invalidation      │
                    └─────────────────────┘
```

### Cache Key Structure

```
Cache Key Format:
  {owner}:{repo}:{prNumber}:{baseCommit}:{headCommit}

Example:
  acme:myapp:123:abc123:def456

Stored Data:
  {
    key: "acme:myapp:123:abc123:def456",
    repository: "acme/myapp",
    prNumber: 123,
    baseCommit: "abc123",
    headCommit: "def456",
    files: Map<string, CachedFileReview>,
    resolvedComments: Set<string>,
    timestamp: 1699999999999
  }
```

### Learning Store Structure

```
Learning Entry:
  {
    id: "unique-id",
    repository: "owner/repo",
    type: "pattern" | "feedback" | "style" | "insight",
    category: "naming" | "security" | "performance" | ...,
    data: { ... },
    confidence: 0.0 - 1.0,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: "review-id"
  }

Query Options:
  {
    repository: "owner/repo",
    type: "pattern",
    category: "naming",
    minConfidence: 0.7,
    limit: 100,
    offset: 0
  }
```

---

## AI Orchestration

### Strategy Patterns

#### Parallel Strategy
```
All models run simultaneously
Results merged by consensus
Fastest completion time
```

#### Sequential Strategy
```
Models run one after another
Each model sees previous results
Best for refinement
```

#### Fallback Strategy
```
Try primary model first
If fails, try next model
Continues until success
```

#### Cascade Strategy
```
Start with cheapest/fastest model
Escalate to better model if unsure
Cost-effective approach
```

#### Ensemble Strategy
```
All models vote on issues
Weighted by model reliability
Highest accuracy
```

### Consensus Algorithm

```
For each comment from each model:
  1. Calculate similarity with other comments
     - Message similarity (cosine)
     - File path match
     - Line range overlap

  2. Group similar comments
     - Threshold: 0.7 similarity

  3. Calculate consensus
     - Count models agreeing
     - Apply model weights
     - Check against threshold

  4. Merge comments
     - Combine messages
     - Adjust severity
     - Track sources
```

---

## Error Handling

### Error Categories

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┬──────────────────────────────────────────────────────┐
│ Error Type       │ Handling Strategy                                     │
├──────────────────┼──────────────────────────────────────────────────────┤
│ ConfigError      │ - Log error details                                   │
│                  │ - Show helpful message                                │
│                  │ - Exit with code 1                                    │
├──────────────────┼──────────────────────────────────────────────────────┤
│ AIProviderError  │ - Retry with exponential backoff                     │
│                  │ - Try fallback provider                              │
│                  │ - Return partial results                             │
├──────────────────┼──────────────────────────────────────────────────────┤
│ GitError         │ - Check repository access                            │
│                  │ - Verify branch exists                               │
│                  │ - Return meaningful error                            │
├──────────────────┼──────────────────────────────────────────────────────┤
│ PRCommentError   │ - Check token permissions                            │
│                  │ - Retry on rate limit                                │
│                  │ - Log failed comments                                │
├──────────────────┼──────────────────────────────────────────────────────┤
│ ChunkingError    │ - Fall back to line-based chunking                   │
│                  │ - Log parsing failures                               │
│                  │ - Continue with valid chunks                         │
├──────────────────┼──────────────────────────────────────────────────────┤
│ StorageError     │ - Retry write operations                             │
│                  │ - Fall back to memory                                │
│                  │ - Continue without caching                           │
└──────────────────┴──────────────────────────────────────────────────────┘
```

### Retry Logic

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number;
    backoffMs: number;
    shouldRetry: (error: Error) => boolean;
  }
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!options.shouldRetry(error)) {
        throw error;
      }

      const delay = options.backoffMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}
```

---

## Extension Points

### Custom AI Provider

```typescript
class CustomAIProvider implements AIProviderInterface {
  async reviewCode(
    code: string,
    language: string,
    instructions?: string
  ): Promise<AIReviewResponse> {
    // Your implementation
  }
}
```

### Custom Storage Adapter

```typescript
class CustomStorageAdapter implements StorageAdapter {
  get(key: string): CachedReview | null { ... }
  set(key: string, value: CachedReview): void { ... }
  delete(key: string): boolean { ... }
  has(key: string): boolean { ... }
  keys(pattern?: string): string[] { ... }
  clear(): void { ... }
  stats(): StorageStats { ... }
  close(): void { ... }
}
```

### Custom Security Check

```typescript
const customCheck: SecurityCheck = {
  type: 'custom-vulnerability',
  name: 'Custom Security Check',
  pattern: /custom-pattern/,
  severity: 'high',
  cwe: 'CWE-XXX',
  owasp: 'A1:2021',
  message: 'Custom vulnerability detected',
  recommendation: 'Fix by...',
};
```

### Webhook Event Handler

```typescript
class CustomWebhookHandler {
  async handleEvent(
    event: WebhookEvent
  ): Promise<WebhookResponse> {
    switch (event.action) {
      case 'custom_action':
        return this.handleCustomAction(event);
      default:
        return { success: false, action: 'ignored' };
    }
  }
}
```

---

## Performance Considerations

### Optimization Strategies

1. **Code Chunking**
   - Use AST-based chunking for accuracy
   - Fall back to line-based for unsupported languages
   - Limit chunk size to avoid token limits

2. **Caching**
   - Cache file hashes for incremental reviews
   - Cache AI responses for repeated reviews
   - Use LRU eviction for memory management

3. **Parallel Processing**
   - Review multiple files concurrently
   - Use multiple AI models in parallel
   - Batch API requests where possible

4. **Token Management**
   - Estimate tokens before API calls
   - Truncate large files intelligently
   - Use streaming for large responses

---

## Monitoring & Observability

### Metrics to Track

```
- Review duration (p50, p95, p99)
- AI API latency
- Cache hit/miss rate
- Error rate by type
- Comments per review
- Fix acceptance rate
```

### Logging Levels

```
DEBUG: Detailed execution flow
INFO:  Major operations
WARN:  Recoverable issues
ERROR: Operation failures
```

### Health Checks

```
- AI provider connectivity
- GitHub/GitLab API access
- Storage adapter status
- Webhook endpoint health
```
