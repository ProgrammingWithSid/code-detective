# Next Optimization Plan - Phase 4

## Overview
This document outlines the next phase of optimizations for **chunkyyy** and **code-sherlock** to further improve accuracy, performance, and user experience.

## ✅ Completed Optimizations (Phases 1-3)

### Chunkyyy
- ✅ **Parser Pooling** - Reuse parser instances to reduce overhead
- ✅ **AST Caching** - Cache parsed ASTs with LRU eviction and TTL
- ✅ **Dependency Resolution** - Enhanced TypeScript path alias and barrel export resolution

### Code-Sherlock
- ✅ **Review Caching** - Cache AI review results to reduce API calls
- ✅ **Chunk Batching** - Intelligent batching of code chunks for efficient AI processing
- ✅ **Parallel Processing** - Process multiple batches concurrently
- ✅ **Rule-Based Filtering** - Pre-filter obvious issues before AI review
- ✅ **Context-Aware Prompts** - Build prompts with framework/file type context
- ✅ **Enhanced Fix Generator** - Better code fix generation

---

## 🎯 Phase 4: Advanced Optimizations

### 1. **Comment Deduplication** ⭐ High Priority
**Problem**: Rule-based filter and AI may generate duplicate comments for the same issue.

**Solution**:
- Create `CommentDeduplicator` utility
- Match comments by file, line, and semantic similarity
- Merge duplicate comments, preserving highest severity
- Reduce noise in PR comments

**Files**:
- `src/utils/comment-deduplicator.ts` (new)
- Update `reviewer.ts` to deduplicate before posting

**Benefits**:
- Cleaner PR comments
- Better user experience
- Reduced comment spam

---

### 2. **Incremental Review Enhancement** ⭐ High Priority
**Problem**: CLI has `--incremental` flag but it's not fully implemented. Need to track reviewed chunks and only review new changes.

**Solution**:
- Create `ReviewTracker` to store reviewed chunk hashes
- Compare current chunk hashes with previously reviewed ones
- Skip already-reviewed chunks unless they've changed
- Store review state per PR/branch

**Files**:
- `src/utils/review-tracker.ts` (new)
- Update `reviewer.ts` to use incremental review
- Update `types/index.ts` for incremental config

**Benefits**:
- Faster reviews on subsequent runs
- Reduced API costs
- Better CI/CD integration

---

### 3. **Streaming/Progressive Results** ⭐ Medium Priority
**Problem**: Users wait for all batches to complete before seeing results.

**Solution**:
- Add streaming support to `ParallelReviewer`
- Emit results as batches complete
- Update CLI to show progressive results
- Add callback/event emitter for real-time updates

**Files**:
- Update `parallel-reviewer.ts` with streaming support
- Update `reviewer.ts` to handle streaming
- Update CLI to display progressive results

**Benefits**:
- Better user experience
- Faster feedback loop
- More responsive UI

---

### 4. **Smart Chunk Prioritization** ⭐ Medium Priority
**Problem**: All chunks are reviewed with equal priority. Some chunks are more likely to have issues.

**Solution**:
- Analyze chunk complexity (cyclomatic complexity, size)
- Prioritize chunks with:
  - Recent changes
  - High complexity
  - Security-sensitive patterns
  - Dependencies on changed files
- Review high-priority chunks first

**Files**:
- `src/utils/chunk-prioritizer.ts` (new)
- Update `chunk-batcher.ts` to use prioritization

**Benefits**:
- Faster detection of critical issues
- Better resource allocation
- Improved review quality

---

### 5. **Error Recovery & Retry Logic** ⭐ Medium Priority
**Problem**: API failures cause entire review to fail. No retry mechanism.

**Solution**:
- Add exponential backoff retry for API calls
- Handle rate limits gracefully
- Partial results on partial failures
- Circuit breaker pattern for repeated failures

**Files**:
- `src/utils/retry-handler.ts` (new)
- Update `ai-provider.ts` to use retry logic
- Update `parallel-reviewer.ts` for error recovery

**Benefits**:
- More resilient reviews
- Better handling of transient failures
- Improved reliability

---

### 6. **Metrics & Observability** ⭐ Low Priority
**Problem**: No visibility into review performance, cache hit rates, or API usage.

**Solution**:
- Add performance metrics collection
- Track: review duration, cache hits/misses, API calls, token usage
- Export metrics for monitoring tools
- Add CLI command to view metrics

**Files**:
- `src/utils/metrics-collector.ts` (new)
- Update `reviewer.ts` to collect metrics
- Add metrics export functionality

**Benefits**:
- Better understanding of performance
- Cost tracking
- Optimization insights

---

### 7. **Configurable Severity Mapping** ⭐ Low Priority
**Problem**: Severity levels are hardcoded. Users may want to customize.

**Solution**:
- Allow users to configure severity mappings
- Map AI severities to custom levels
- Support per-rule severity overrides
- Config file support

**Files**:
- Update `types/index.ts` for severity config
- `src/utils/severity-mapper.ts` (new)
- Update `reviewer.ts` to use severity mapping

**Benefits**:
- More flexible configuration
- Better alignment with team standards
- Customizable review experience

---

### 8. **Cross-File Context Enhancement** ⭐ Low Priority
**Problem**: Reviews are chunk-based. Missing context about how chunks interact.

**Solution**:
- Build dependency graph of chunks
- Include related chunks in context
- Review related chunks together
- Better understanding of cross-file issues

**Files**:
- Enhance `dependency-resolver.ts`
- Update `context-aware-prompt.ts` with cross-file context
- Update `chunk-batcher.ts` to group related chunks

**Benefits**:
- More accurate reviews
- Better detection of architectural issues
- Improved context understanding

---

## 📊 Priority Ranking

1. **Comment Deduplication** - Quick win, high impact
2. **Incremental Review** - Already partially implemented, high value
3. **Streaming Results** - Better UX, medium effort
4. **Smart Prioritization** - Performance boost, medium effort
5. **Error Recovery** - Reliability improvement, medium effort
6. **Metrics** - Observability, low priority
7. **Severity Mapping** - Configuration flexibility, low priority
8. **Cross-File Context** - Advanced feature, low priority

---

## 🚀 Implementation Order

### Sprint 1: Quick Wins
1. Comment Deduplication
2. Incremental Review Enhancement

### Sprint 2: UX Improvements
3. Streaming/Progressive Results
4. Smart Chunk Prioritization

### Sprint 3: Reliability
5. Error Recovery & Retry Logic

### Sprint 4: Polish
6. Metrics & Observability
7. Configurable Severity Mapping
8. Cross-File Context Enhancement

---

## 📝 Notes

- All optimizations should maintain backward compatibility
- Each feature should have comprehensive tests
- Performance benchmarks should be added
- Documentation should be updated for each feature

---

## 🎯 Success Metrics

- **Performance**: 30% reduction in review time
- **Cost**: 40% reduction in API calls (via caching + incremental)
- **Accuracy**: 20% reduction in false positives (via deduplication)
- **Reliability**: 99% success rate (via error recovery)
- **UX**: Real-time feedback (via streaming)

---

## 🤔 Questions to Consider

1. Should incremental review be opt-in or default?
2. What's the preferred metrics export format? (Prometheus, JSON, etc.)
3. Should streaming be available in CLI only or also in library API?
4. How should we handle partial failures in parallel reviews?
