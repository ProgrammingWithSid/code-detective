import { CodeChunk } from '../types';

/**
 * Review context information
 */
export interface ReviewContext {
  framework?: 'react' | 'vue' | 'angular' | 'svelte' | 'none';
  fileTypes?: string[];
  dependencies?: Array<{ name: string; source: string }>;
  codebasePatterns?: string[];
  language?: string;
}

/**
 * Context-aware prompt builder
 * Enhances prompts with framework-specific and context-aware information
 */
export class ContextAwarePromptBuilder {
  /**
   * Build enhanced prompt with context
   */
  buildPrompt(chunks: CodeChunk[], globalRules: string[], context: ReviewContext): string {
    let prompt = this.buildBasePrompt();

    // Add framework-specific context
    if (context.framework) {
      prompt += this.addFrameworkContext(context.framework);
    }

    // Add file type context
    if (context.fileTypes && context.fileTypes.length > 0) {
      prompt += this.addFileTypeContext(context.fileTypes);
    }

    // Add dependency context
    if (context.dependencies && context.dependencies.length > 0) {
      prompt += this.addDependencyContext(context.dependencies);
    }

    // Add codebase patterns
    if (context.codebasePatterns && context.codebasePatterns.length > 0) {
      prompt += this.addCodebasePatterns(context.codebasePatterns);
    }

    // Add global rules
    if (globalRules.length > 0) {
      prompt += this.addGlobalRules(globalRules);
    }

    // Add chunks
    prompt += this.addChunks(chunks);

    return prompt;
  }

  /**
   * Build base prompt
   */
  private buildBasePrompt(): string {
    return `# Code Review Request

You are an Expert Senior Software Engineer & Code Reviewer.

Analyze the provided code and identify issues in the following categories:
- Bugs: Logic errors, runtime issues, incorrect async/state handling, edge cases
- Security: Injection vulnerabilities, hardcoded secrets, unsafe eval, authentication flaws
- Performance: N+1 queries, inefficient loops, heavy operations repeated, blocking I/O
- Code Quality: Anti-patterns, code smells, missing null checks, poor naming, duplicated logic
- Architecture: Tight coupling, missing validation, weak contracts, bad error-handling

`;
  }

  /**
   * Add framework-specific context
   */
  private addFrameworkContext(framework: string): string {
    const contexts: Record<string, string> = {
      react: `
## React-Specific Guidelines

- Check for proper hook dependencies in useEffect, useMemo, useCallback
- Verify component memoization (React.memo, useMemo) where appropriate
- Check for unnecessary re-renders and missing dependency arrays
- Validate prop types and default props
- Ensure proper cleanup in useEffect hooks (return cleanup functions)
- Check for state updates in render functions
- Verify proper use of React Context (avoid unnecessary re-renders)
- Check for proper key props in lists
- Validate event handler dependencies

`,
      vue: `
## Vue-Specific Guidelines

- Check for proper reactivity (ref, reactive, computed)
- Verify proper lifecycle hook usage
- Check for memory leaks in watchers and event listeners
- Validate component props and emits
- Ensure proper cleanup in onUnmounted hooks
- Check for proper use of provide/inject
- Verify template ref usage
- Check for proper v-model implementations
- Check for prop mutation

`,
      angular: `
## Angular-Specific Guidelines

- Check for proper change detection strategy
- Verify proper use of OnPush change detection
- Check for memory leaks in subscriptions (unsubscribe)
- Validate component inputs and outputs
- Ensure proper dependency injection
- Check for proper use of async pipe
- Verify proper use of trackBy functions in *ngFor

`,
      svelte: `
## Svelte-Specific Guidelines

- Check for proper reactivity ($: statements)
- Verify proper store subscriptions
- Check for memory leaks in event listeners
- Validate component props
- Ensure proper cleanup in onDestroy
- Check for proper use of bind: directives

`,
    };

    return contexts[framework] || '';
  }

  /**
   * Add file type context
   */
  private addFileTypeContext(fileTypes: string[]): string {
    const typeContexts: Record<string, string> = {
      typescript: `
## TypeScript Guidelines

- Check for proper type annotations
- Verify no use of 'any' type
- Check for proper null/undefined handling
- Validate interface/type definitions
- Check for proper generic usage

`,
      test: `
## Test File Guidelines

- Verify test coverage and edge cases
- Check for proper test isolation
- Validate mock usage
- Check for flaky tests (time-dependent, random)
- Verify proper cleanup in tests

`,
      api: `
## API/Backend Guidelines

- Check for proper error handling
- Verify input validation
- Check for SQL injection vulnerabilities
- Validate authentication/authorization
- Check for proper rate limiting
- Verify proper logging

`,
    };

    let context = '\n## File Type Context\n\n';
    for (const fileType of fileTypes) {
      const lowerType = fileType.toLowerCase();
      if (typeContexts[lowerType]) {
        context += typeContexts[lowerType];
      }
    }

    return context;
  }

  /**
   * Add dependency context
   */
  private addDependencyContext(dependencies: Array<{ name: string; source: string }>): string {
    if (dependencies.length === 0) return '';

    let context = '\n## Dependency Context\n\nThe code uses the following dependencies:\n';
    for (const dep of dependencies.slice(0, 20)) {
      // Limit to 20 to avoid prompt bloat
      context += `- ${dep.name} from ${dep.source}\n`;
    }

    context += '\nConsider how these dependencies are used and whether they are appropriate.\n';

    return context;
  }

  /**
   * Add codebase patterns
   */
  private addCodebasePatterns(patterns: string[]): string {
    if (patterns.length === 0) return '';

    let context = '\n## Codebase-Specific Patterns\n\n';
    context += 'The following patterns are commonly used in this codebase:\n';
    for (const pattern of patterns) {
      context += `- ${pattern}\n`;
    }
    context += '\nPrefer these patterns when suggesting improvements.\n';

    return context;
  }

  /**
   * Add global rules
   */
  private addGlobalRules(rules: string[]): string {
    if (rules.length === 0) return '';

    let context = '\n## Additional Rules to Check\n\n';
    for (let i = 0; i < rules.length; i++) {
      context += `${i + 1}. ${rules[i]}\n`;
    }
    context += '\n';

    return context;
  }

  /**
   * Add code chunks to prompt
   */
  private addChunks(chunks: CodeChunk[]): string {
    let prompt = '\n## Code Chunks to Review\n\n';

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      prompt += `### Chunk ${i + 1}: ${chunk.name} (${chunk.type})\n`;
      prompt += `**File:** ${chunk.file}\n`;
      prompt += `**Lines:** ${chunk.startLine}-${chunk.endLine}\n`;

      // Include language and extension information from chunkyyy
      if (chunk.language) {
        prompt += `**Language:** ${chunk.language}\n`;
      }
      if (chunk.extension) {
        prompt += `**File Extension:** ${chunk.extension}\n`;
      }

      if (chunk.dependencies && chunk.dependencies.length > 0) {
        prompt += `**Dependencies:** ${chunk.dependencies.join(', ')}\n`;
      }

      // Use language from chunk if available, otherwise fallback to file-based detection
      const lang = chunk.language || this.getLanguageFromFile(chunk.file);
      prompt += `\n\`\`\`${lang}\n${chunk.content}\n\`\`\`\n\n`;
    }

    prompt +=
      '\n**IMPORTANT**: Only report issues on the lines shown above. Do not hallucinate file names or line numbers.\n';

    return prompt;
  }

  /**
   * Get language from file path
   */
  private getLanguageFromFile(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      vue: 'vue',
      svelte: 'svelte',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      kt: 'kotlin',
      rb: 'ruby',
      css: 'css',
      scss: 'scss',
      html: 'html',
      json: 'json',
    };
    return (langMap[ext] ?? ext) || 'text';
  }

  /**
   * Extract context from chunks
   */
  static extractContext(chunks: CodeChunk[]): ReviewContext {
    const fileTypes = new Set<string>();
    const dependencies: Array<{ name: string; source: string }> = [];
    const frameworks = new Set<string>();

    for (const chunk of chunks) {
      // Detect file types
      const ext = chunk.file.split('.').pop()?.toLowerCase() || '';
      if (ext === 'ts' || ext === 'tsx') fileTypes.add('typescript');
      if (chunk.file.includes('.test.') || chunk.file.includes('.spec.')) {
        fileTypes.add('test');
      }
      if (
        chunk.file.includes('api') ||
        chunk.file.includes('server') ||
        chunk.file.includes('route')
      ) {
        fileTypes.add('api');
      }

      // Detect frameworks
      if (chunk.file.endsWith('.tsx') || chunk.file.endsWith('.jsx')) {
        frameworks.add('react');
      }
      if (chunk.file.endsWith('.vue')) {
        frameworks.add('vue');
      }
      if (chunk.file.includes('.component.')) {
        frameworks.add('angular');
      }
      if (chunk.file.endsWith('.svelte')) {
        frameworks.add('svelte');
      }

      // Extract dependencies
      if (chunk.dependencies) {
        for (const dep of chunk.dependencies) {
          if (typeof dep === 'string') {
            dependencies.push({ name: dep, source: 'unknown' });
          }
        }
      }
    }

    return {
      framework:
        frameworks.size === 1
          ? (Array.from(frameworks)[0] as ReviewContext['framework'])
          : frameworks.size > 1
            ? 'react' // Default to react if multiple
            : 'none',
      fileTypes: Array.from(fileTypes),
      dependencies: dependencies.slice(0, 20), // Limit to 20
    };
  }
}
