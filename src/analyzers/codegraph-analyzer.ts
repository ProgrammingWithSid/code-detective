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
import { join, dirname, relative } from 'path';
import { CodeChunk, ChangedFile } from '../types';

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
  async buildGraph(files: string[]): Promise<DependencyGraph> {
    const nodes = new Map<string, DependencyNode>();
    const dependents = new Map<string, Set<string>>();

    // Analyze each file
    for (const file of files) {
      if (this.shouldExclude(file)) continue;

      try {
        const node = await this.analyzeFile(file);
        if (node) {
          nodes.set(file, node);
        }
      } catch (error) {
        console.warn(`Failed to analyze ${file}:`, error);
      }
    }

    // Build reverse dependency map
    for (const [file, node] of nodes) {
      for (const dep of node.fileDeps) {
        if (!dependents.has(dep)) {
          dependents.set(dep, new Set());
        }
        dependents.get(dep)!.add(file);
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
    const changedFiles = changes.map((c) => c.path);
    const affectedFiles = new Set<string>();
    const dependencyFiles = new Set<string>();
    const impactChain = new Set<string>();

    // Add changed files to impact chain
    changedFiles.forEach((file) => impactChain.add(file));

    // Find files that depend on changed files
    for (const file of changedFiles) {
      const dependents = this.graph.dependents.get(file);
      if (dependents) {
        dependents.forEach((dep) => {
          affectedFiles.add(dep);
          impactChain.add(dep);
        });
      }

      // Find files that changed files depend on
      const node = this.graph.nodes.get(file);
      if (node) {
        node.fileDeps.forEach((dep) => {
          dependencyFiles.add(dep);
          impactChain.add(dep);
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
    return this.graph.nodes.get(file);
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
   * Analyze a single file for dependencies
   */
  private async analyzeFile(file: string): Promise<DependencyNode | null> {
    if (!existsSync(file)) {
      return null;
    }

    const content = readFileSync(file, 'utf-8');
    const ext = file.split('.').pop()?.toLowerCase() || '';

    // Detect language and parse accordingly
    if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
      return this.analyzeJavaScriptFile(file, content);
    } else if (ext === 'py') {
      return this.analyzePythonFile(file, content);
    } else if (ext === 'go') {
      return this.analyzeGoFile(file, content);
    }

    // Default: basic analysis
    return this.analyzeBasicFile(file, content);
  }

  /**
   * Analyze JavaScript/TypeScript file
   */
  private analyzeJavaScriptFile(file: string, content: string): DependencyNode {
    const imports: DependencyNode['imports'] = [];
    const exports: string[] = [];
    const fileDeps = new Set<string>();
    const internalDeps: DependencyNode['internalDeps'] = [];

    const lines = content.split('\n');

    // Parse imports
    const importRegex =
      /import\s+(?:(?:\*\s+as\s+(\w+))|(?:\{([^}]+)\})|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const [, namespace, named, defaultImport, source] = match;
      const resolvedSource = this.resolveImportPath(file, source);

      if (namespace) {
        imports.push({
          symbol: namespace,
          source: resolvedSource,
          type: 'namespace',
        });
        fileDeps.add(resolvedSource);
      } else if (named) {
        const symbols = named.split(',').map((s) => s.trim().split(' as ')[0].trim());
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
        const symbols = namedExports.split(',').map((s) => s.trim().split(' as ')[0].trim());
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
      exports.push(match[1]);
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
          if (importMatch) {
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
      exports.push(match[1]);
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
  private analyzeBasicFile(file: string, content: string): DependencyNode {
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
        const candidate = resolved + ext;
        if (existsSync(candidate)) {
          return candidate;
        }
        const indexCandidate = join(resolved, 'index' + ext);
        if (existsSync(indexCandidate)) {
          return indexCandidate;
        }
      }
      return resolved;
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
    let currentPos = 0;

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
    if (functionMatch) {
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
    return excludePatterns.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file);
      }
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
