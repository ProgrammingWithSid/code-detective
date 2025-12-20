/**
 * Codegraph Analyzer - Full dependency mapping and impact analysis
 *
 * Features:
 * - Builds complete dependency graph across files
 * - Analyzes impact of changes on dependent code
 * - Maps imports/exports relationships
 * - Tracks function/class dependencies
 * - Visualizes code relationships
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, normalize, resolve } from 'path';
import { ChangedFile } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface DependencyNode {
  /** File path */
  file: string;
  /** Exported symbols (functions, classes, types, etc.) */
  exports: string[];
  /** Imported symbols and their sources */
  imports: Array<{
    symbol: string;
    source: string;
    type: 'default' | 'named' | 'namespace' | 'type';
  }>;
  /** Internal dependencies (functions calling other functions) */
  internalDeps: Array<{
    caller: string;
    callee: string;
    line: number;
  }>;
  /** File dependencies (imports from other files) */
  fileDeps: string[];
}

export interface DependencyGraph {
  /** Map of file path to dependency node */
  nodes: Map<string, DependencyNode>;
  /** Reverse dependencies (who depends on this file) */
  dependents: Map<string, Set<string>>;
  /** Total number of files */
  fileCount: number;
  /** Total number of dependencies */
  dependencyCount: number;
}

export interface ImpactAnalysis {
  /** Files directly changed */
  changedFiles: string[];
  /** Files that depend on changed files */
  affectedFiles: string[];
  /** Files that changed files depend on */
  dependencyFiles: string[];
  /** All files in the impact chain */
  impactChain: string[];
  /** Severity of impact (high/medium/low) */
  severity: 'high' | 'medium' | 'low';
  /** Estimated files that need review */
  reviewScope: number;
}

export interface CodegraphOptions {
  /** Root directory to analyze */
  rootDir: string;
  /** File patterns to include */
  includePatterns?: string[];
  /** File patterns to exclude */
  excludePatterns?: string[];
  /** Maximum depth for dependency traversal */
  maxDepth?: number;
  /** Whether to analyze internal dependencies */
  analyzeInternal?: boolean;
}

// ============================================================================
// Codegraph Analyzer Class
// ============================================================================

export class CodegraphAnalyzer {
  private options: CodegraphOptions;
  private graph: DependencyGraph;

  constructor(options: CodegraphOptions) {
    this.options = {
      maxDepth: 5,
      analyzeInternal: true,
      includePatterns: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'],
      excludePatterns: ['node_modules', '.git', 'dist', 'build', '__tests__', '*.test.*'],
      ...options,
    };
    this.graph = {
      nodes: new Map(),
      dependents: new Map(),
      fileCount: 0,
      dependencyCount: 0,
    };
  }

  /**
   * Build dependency graph from codebase
   */
  buildGraph(files: string[]): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    const dependents = new Map<string, Set<string>>();

    // Analyze each file
    for (const file of files) {
      if (this.shouldExclude(file)) continue;

      try {
        // Resolve to absolute path first (for file existence check)
        const absoluteFile = resolve(this.options.rootDir, file);
        // Then normalize for consistent storage/lookup
        const normalizedFile = normalize(absoluteFile);

        // Use absolute path for file operations (analyzeFile checks existence)
        // But pass normalized path to analysis methods so resolveImportPath uses consistent paths
        const node = this.analyzeFileWithNormalizedPath(absoluteFile, normalizedFile);
        if (node) {
          // Update node file path to normalized version
          node.file = normalizedFile;
          // Normalize all fileDeps to ensure consistent paths
          node.fileDeps = node.fileDeps.map((dep) => normalize(dep));
          nodes.set(normalizedFile, node);
        }
      } catch (error) {
        console.warn(`Failed to analyze ${file}:`, error);
      }
    }

    // Build reverse dependency map
    for (const [file, node] of nodes) {
      for (const dep of node.fileDeps) {
        // Normalize dependency path to match stored paths
        const normalizedDep = normalize(dep);
        if (!dependents.has(normalizedDep)) {
          dependents.set(normalizedDep, new Set());
        }
        dependents.get(normalizedDep)!.add(file);
      }
    }

    this.graph = {
      nodes,
      dependents,
      fileCount: nodes.size,
      dependencyCount: Array.from(nodes.values()).reduce(
        (sum, node) => sum + node.fileDeps.length,
        0
      ),
    };

    return this.graph;
  }

  /**
   * Analyze impact of changes
   */
  analyzeImpact(changes: ChangedFile[]): ImpactAnalysis {
    const changedFiles = changes.map((c) => {
      // Normalize path (handle both absolute and relative paths)
      return c.path.startsWith('/') || c.path.match(/^[A-Z]:/i)
        ? normalize(c.path)
        : normalize(resolve(this.options.rootDir, c.path));
    });
    const affectedFiles = new Set<string>();
    const dependencyFiles = new Set<string>();
    const impactChain = new Set<string>();

    // Add changed files to impact chain
    changedFiles.forEach((file) => impactChain.add(file));

    // Recursively find all files that depend on changed files (transitive dependencies)
    const visited = new Set<string>();
    const queue = [...changedFiles];

    while (queue.length > 0) {
      const file = queue.shift()!;
      if (visited.has(file)) continue;
      visited.add(file);

      const dependents = this.graph.dependents.get(file);
      if (dependents) {
        dependents.forEach((dep) => {
          if (!visited.has(dep)) {
            affectedFiles.add(dep);
            impactChain.add(dep);
            queue.push(dep); // Add to queue to find its dependents too
          }
        });
      }

      // Find files that changed files depend on
      const node = this.graph.nodes.get(file);
      if (node) {
        node.fileDeps.forEach((dep) => {
          if (!visited.has(dep)) {
            dependencyFiles.add(dep);
            impactChain.add(dep);
          }
        });
      }
    }

    // Calculate severity
    const severity = this.calculateSeverity(
      changedFiles.length,
      affectedFiles.size,
      dependencyFiles.size
    );

    return {
      changedFiles,
      affectedFiles: Array.from(affectedFiles),
      dependencyFiles: Array.from(dependencyFiles),
      impactChain: Array.from(impactChain),
      severity,
      reviewScope: impactChain.size,
    };
  }

  /**
   * Get dependencies for a file
   */
  getDependencies(file: string): DependencyNode | undefined {
    // Use the same path resolution as buildGraph
    const normalizedFile = this.resolveFilePath(file);
    return this.graph.nodes.get(normalizedFile);
  }

  /**
   * Get files that depend on a file
   */
  getDependents(file: string): string[] {
    const dependents = this.graph.dependents.get(file);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Generate visualization (Mermaid format)
   */
  generateVisualization(files?: string[]): string {
    const filesToVisualize = files || Array.from(this.graph.nodes.keys()).slice(0, 20);
    const lines: string[] = ['```mermaid', 'graph TD'];

    const nodeIds = new Map<string, string>();

    // Create node IDs
    filesToVisualize.forEach((file, index) => {
      const nodeId = `N${index}`;
      nodeIds.set(file, nodeId);
      const shortName = file.split('/').pop() || file;
      lines.push(`  ${nodeId}["${shortName}"]`);
    });

    // Add edges
    for (const file of filesToVisualize) {
      const node = this.graph.nodes.get(file);
      const fromId = nodeIds.get(file);
      if (!node || !fromId) continue;

      for (const dep of node.fileDeps) {
        const toId = nodeIds.get(dep);
        if (toId && filesToVisualize.includes(dep)) {
          lines.push(`  ${fromId} --> ${toId}`);
        }
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Resolve and normalize a file path consistently
   */
  private resolveFilePath(file: string): string {
    // Always resolve relative to rootDir for consistency
    // If file is already absolute, resolve will return it as-is
    const absoluteFile = resolve(this.options.rootDir, file);
    return normalize(absoluteFile);
  }

  /**
   * Analyze file with normalized path for consistent dependency resolution
   */
  private analyzeFileWithNormalizedPath(
    absoluteFile: string,
    normalizedFile: string
  ): DependencyNode | null {
    // Check if file exists at absolute path
    if (!existsSync(absoluteFile)) {
      return null;
    }

    const content = readFileSync(absoluteFile, 'utf-8');
    const ext = absoluteFile.split('.').pop()?.toLowerCase() || '';

    // Detect language and parse accordingly
    // Use normalizedFile for dependency resolution to ensure consistent paths
    if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
      return this.analyzeJavaScriptFile(normalizedFile, content);
    } else if (ext === 'py') {
      return this.analyzePythonFile(normalizedFile, content);
    } else if (ext === 'go') {
      return this.analyzeGoFile(normalizedFile, content);
    }

    // Default: basic analysis
    return this.analyzeBasicFile(normalizedFile, content);
  }

  /**
   * Analyze JavaScript/TypeScript file
   */
  private analyzeJavaScriptFile(file: string, content: string): DependencyNode {
    const imports: DependencyNode['imports'] = [];
    const exports: string[] = [];
    const fileDeps = new Set<string>();
    const internalDeps: DependencyNode['internalDeps'] = [];

    // Parse imports
    const importRegex =
      /import\s+(?:(?:\*\s+as\s+(\w+))|(?:\{([^}]+)\})|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const [, namespace, named, defaultImport, source] = match;
      if (!source) continue; // Skip if source is missing

      // resolveImportPath already normalizes, so we get a normalized path
      const resolvedSource = this.resolveImportPath(file, source);

      if (namespace) {
        imports.push({
          symbol: namespace,
          source: resolvedSource,
          type: 'namespace',
        });
        fileDeps.add(resolvedSource);
      } else if (named) {
        const namedValue: string = named;
        const symbols = namedValue.split(',').map((s) => {
          const parts = s.trim().split(' as ');
          return parts[0]?.trim() || s.trim();
        });
        symbols.forEach((symbol) => {
          imports.push({
            symbol,
            source: resolvedSource,
            type: 'named',
          });
        });
        fileDeps.add(resolvedSource);
      } else if (defaultImport) {
        imports.push({
          symbol: defaultImport,
          source: resolvedSource,
          type: 'default',
        });
        fileDeps.add(resolvedSource);
      }
    }

    // Parse exports
    const exportRegex =
      /export\s+(?:(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)|(?:\{([^}]+)\}))/g;
    while ((match = exportRegex.exec(content)) !== null) {
      const [, singleExport, namedExports] = match;
      if (singleExport) {
        exports.push(singleExport);
      } else if (namedExports) {
        const namedExportsValue: string = namedExports;
        const symbols = namedExportsValue.split(',').map((s) => {
          const parts = s.trim().split(' as ');
          return parts[0]?.trim() || s.trim();
        });
        exports.push(...symbols);
      }
    }

    // Parse internal dependencies (function calls)
    if (this.options.analyzeInternal) {
      const functionCallRegex = /(\w+)\s*\(/g;
      const definedFunctions = new Set(exports);
      const lineNumbers = this.getLineNumbers(content);

      while ((match = functionCallRegex.exec(content)) !== null) {
        const callee = match[1];
        if (!callee) continue; // Skip if callee is missing

        const line = lineNumbers[match.index] || 1;

        // Check if it's a call to an imported function
        const importMatch = imports.find((imp) => imp.symbol === callee);
        if (importMatch) {
          // External dependency, already tracked
          continue;
        }

        // Check if it's a call to a defined function
        if (definedFunctions.has(callee)) {
          internalDeps.push({
            caller: this.getCurrentFunction(content, match.index),
            callee,
            line,
          });
        }
      }
    }

    return {
      file,
      exports,
      imports,
      internalDeps,
      fileDeps: Array.from(fileDeps),
    };
  }

  /**
   * Analyze Python file
   */
  private analyzePythonFile(file: string, content: string): DependencyNode {
    const imports: DependencyNode['imports'] = [];
    const exports: string[] = [];
    const fileDeps = new Set<string>();

    // Parse imports
    const importRegex = /(?:from\s+([\w.]+)\s+)?import\s+([\w\s,]+)/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const [, module, symbols] = match;
      if (!symbols) continue; // Skip if symbols is missing

      if (module) {
        const resolvedSource = this.resolvePythonImport(file, module);
        const symbolList = symbols.split(',').map((s) => s.trim());
        symbolList.forEach((symbol) => {
          imports.push({
            symbol,
            source: resolvedSource,
            type: 'named',
          });
        });
        fileDeps.add(resolvedSource);
      } else {
        // import module
        const moduleName = symbols.trim();
        const resolvedSource = this.resolvePythonImport(file, moduleName);
        imports.push({
          symbol: moduleName,
          source: resolvedSource,
          type: 'namespace',
        });
        fileDeps.add(resolvedSource);
      }
    }

    // Parse exports (functions/classes defined at module level)
    const exportRegex = /^(?:def|class)\s+(\w+)/gm;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) {
        exports.push(match[1]);
      }
    }

    return {
      file,
      exports,
      imports,
      internalDeps: [],
      fileDeps: Array.from(fileDeps),
    };
  }

  /**
   * Analyze Go file
   */
  private analyzeGoFile(file: string, content: string): DependencyNode {
    const imports: DependencyNode['imports'] = [];
    const exports: string[] = [];
    const fileDeps = new Set<string>();

    // Parse imports
    const importRegex = /import\s+(?:\(([^)]+)\)|"([^"]+)")/gs;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const [, multiImports, singleImport] = match;
      if (multiImports) {
        const importLines = multiImports.split('\n').map((line) => line.trim());
        importLines.forEach((line) => {
          const importMatch = line.match(/"([^"]+)"/);
          if (importMatch && importMatch[1]) {
            const source = importMatch[1];
            fileDeps.add(source);
            imports.push({
              symbol: source.split('/').pop() || source,
              source,
              type: 'namespace',
            });
          }
        });
      } else if (singleImport) {
        fileDeps.add(singleImport);
        imports.push({
          symbol: singleImport.split('/').pop() || singleImport,
          source: singleImport,
          type: 'namespace',
        });
      }
    }

    // Parse exports (capitalized functions/types)
    const exportRegex = /^(?:func|type|const|var)\s+([A-Z]\w+)/gm;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) {
        exports.push(match[1]);
      }
    }

    return {
      file,
      exports,
      imports,
      internalDeps: [],
      fileDeps: Array.from(fileDeps),
    };
  }

  /**
   * Basic file analysis (fallback)
   */
  private analyzeBasicFile(file: string, _content: string): DependencyNode {
    return {
      file,
      exports: [],
      imports: [],
      internalDeps: [],
      fileDeps: [],
    };
  }

  /**
   * Resolve import path to absolute file path
   */
  private resolveImportPath(fromFile: string, importPath: string): string {
    // Handle relative imports
    if (importPath.startsWith('.')) {
      const baseDir = dirname(fromFile);
      const resolved = join(baseDir, importPath);
      // Try different extensions
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '']) {
        const candidate = normalize(resolved + ext);
        if (existsSync(candidate)) {
          return candidate;
        }
        const indexCandidate = normalize(join(resolved, 'index' + ext));
        if (existsSync(indexCandidate)) {
          return indexCandidate;
        }
      }
      return normalize(resolved);
    }

    // Handle node_modules imports
    if (!importPath.startsWith('.')) {
      return join(this.options.rootDir, 'node_modules', importPath);
    }

    return importPath;
  }

  /**
   * Resolve Python import to file path
   */
  private resolvePythonImport(fromFile: string, module: string): string {
    // Handle relative imports
    if (module.startsWith('.')) {
      const baseDir = dirname(fromFile);
      const parts = module.split('.');
      let path = baseDir;
      for (const part of parts) {
        if (part === '') continue;
        path = join(path, part);
      }
      // Try .py extension
      const candidate = path + '.py';
      if (existsSync(candidate)) {
        return candidate;
      }
      const initCandidate = join(path, '__init__.py');
      if (existsSync(initCandidate)) {
        return initCandidate;
      }
      return path;
    }

    // Handle absolute imports (simplified)
    return join(this.options.rootDir, module.replace(/\./g, '/'));
  }

  /**
   * Get line numbers for character positions
   */
  private getLineNumbers(content: string): Record<number, number> {
    const lineNumbers: Record<number, number> = {};
    let currentLine = 1;

    for (let i = 0; i < content.length; i++) {
      lineNumbers[i] = currentLine;
      if (content[i] === '\n') {
        currentLine++;
      }
    }

    return lineNumbers;
  }

  /**
   * Get current function name at position
   */
  private getCurrentFunction(content: string, position: number): string {
    const before = content.substring(0, position);
    const functionMatch = before.match(/(?:function|const|let|var)\s+(\w+)\s*[=:]/);
    if (functionMatch && functionMatch[1]) {
      return functionMatch[1];
    }
    return 'anonymous';
  }

  /**
   * Calculate impact severity
   */
  private calculateSeverity(
    changed: number,
    affected: number,
    dependencies: number
  ): 'high' | 'medium' | 'low' {
    const totalImpact = changed + affected + dependencies;

    if (totalImpact > 20 || affected > 10) {
      return 'high';
    } else if (totalImpact > 10 || affected > 5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Check if file should be excluded
   */
  private shouldExclude(file: string): boolean {
    const excludePatterns = this.options.excludePatterns || [];
    const fileName = file.split('/').pop() || file; // Get just the filename

    return excludePatterns.some((pattern) => {
      if (pattern.includes('*')) {
        // For patterns with *, check if it's a filename pattern (contains . which suggests file extension)
        // Patterns like *.test.* should match filenames only, not directory paths
        const isFilenamePattern = pattern.includes('.');
        if (isFilenamePattern) {
          // Match against filename only to avoid false positives (e.g., codegraph-test-123 matching *.test.*)
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(fileName);
        }
        // For other patterns with *, match against full path
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file);
      }
      // For patterns without *, check full path (for directory patterns like node_modules)
      return file.includes(pattern);
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCodegraphAnalyzer(options: CodegraphOptions): CodegraphAnalyzer {
  return new CodegraphAnalyzer(options);
}
