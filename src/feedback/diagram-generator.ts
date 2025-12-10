/**
 * Diagram Generator - Generates mermaid diagrams for PR visualization
 */

import { CodeChunk } from '../types';
import { DiagramOptions, DiagramType, FileChange } from '../types/summary';

// ============================================================================
// Diagram Generator Class
// ============================================================================

export class DiagramGenerator {
  /**
   * Generate a mermaid diagram based on type
   */
  generate(
    type: DiagramType,
    data: FileChange[] | CodeChunk[],
    options: Partial<DiagramOptions> = {}
  ): string {
    switch (type) {
      case 'fileTree':
        return this.generateFileTree(data as FileChange[]);
      case 'flowchart':
        return this.generateFlowchart(data as FileChange[], options);
      case 'sequence':
        return this.generateSequence(data as CodeChunk[]);
      case 'dependency':
        return this.generateDependency(data as CodeChunk[], options);
      default:
        return '';
    }
  }

  /**
   * Generate a file tree diagram showing changed files
   */
  generateFileTree(files: FileChange[]): string {
    if (files.length === 0) return '';

    const lines = ['```mermaid', 'graph LR'];

    // Add root node
    lines.push('  root((📁 Changes))');

    // Add directory and file nodes
    const processed = new Set<string>();

    for (const file of files) {
      const parts = file.path.split('/');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;

        const isLast = i === parts.length - 1;
        const prevPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!processed.has(currentPath)) {
          processed.add(currentPath);

          const parentNode = prevPath ? this.sanitizeId(prevPath) : 'root';
          const currentNode = this.sanitizeId(currentPath);

          if (isLast) {
            // File node with status indicator
            const emoji = this.getFileStatusEmoji(file.status);
            lines.push(`  ${currentNode}[${emoji} ${part}]`);
          } else {
            // Directory node
            lines.push(`  ${currentNode}[📁 ${part}]`);
          }

          lines.push(`  ${parentNode} --> ${currentNode}`);
        }
      }
    }

    // Style nodes based on status
    lines.push('');
    lines.push('  classDef added fill:#d4edda,stroke:#28a745');
    lines.push('  classDef modified fill:#fff3cd,stroke:#ffc107');
    lines.push('  classDef deleted fill:#f8d7da,stroke:#dc3545');

    for (const file of files) {
      const nodeId = this.sanitizeId(file.path);
      lines.push(`  class ${nodeId} ${file.status}`);
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Generate a flowchart showing file relationships
   */
  generateFlowchart(files: FileChange[], options: Partial<DiagramOptions> = {}): string {
    if (files.length === 0) return '';

    const direction = options.direction ?? 'TB';
    const maxNodes = options.maxNodes ?? 20;
    const limitedFiles = files.slice(0, maxNodes);

    const lines = ['```mermaid', `flowchart ${direction}`];

    // Group by directory
    const dirGroups = this.groupByDirectory(limitedFiles);

    for (const [dir, dirFiles] of Object.entries(dirGroups)) {
      const subgraphId = this.sanitizeId(dir || 'root');
      lines.push(`  subgraph ${subgraphId}["📁 ${dir || 'root'}"]`);

      for (const file of dirFiles) {
        const fileName = file.path.split('/').pop() ?? file.path;
        const nodeId = this.sanitizeId(file.path);
        const emoji = this.getFileStatusEmoji(file.status);
        const stats = `+${file.additions}/-${file.deletions}`;
        lines.push(`    ${nodeId}["${emoji} ${fileName}<br/>${stats}"]`);
      }

      lines.push('  end');
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Generate a sequence diagram from code chunks
   */
  generateSequence(chunks: CodeChunk[]): string {
    if (chunks.length === 0) return '';

    const lines = ['```mermaid', 'sequenceDiagram'];
    lines.push('  autonumber');

    // Extract participants (files)
    const participants = [...new Set(chunks.map((c) => c.file))];
    for (const participant of participants.slice(0, 10)) {
      const name = participant.split('/').pop() ?? participant;
      lines.push(`  participant ${this.sanitizeId(participant)} as ${name}`);
    }

    // Create sequence based on dependencies
    for (const chunk of chunks) {
      if (chunk.dependencies && chunk.dependencies.length > 0) {
        const from = this.sanitizeId(chunk.file);
        for (const dep of chunk.dependencies.slice(0, 5)) {
          const to = this.sanitizeId(dep);
          if (participants.includes(dep)) {
            lines.push(`  ${from}->>+${to}: ${chunk.name}`);
            lines.push(`  ${to}-->>-${from}: response`);
          }
        }
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Generate a dependency graph from code chunks
   */
  generateDependency(chunks: CodeChunk[], options: Partial<DiagramOptions> = {}): string {
    if (chunks.length === 0) return '';

    const direction = options.direction ?? 'LR';
    const maxNodes = options.maxNodes ?? 15;

    const lines = ['```mermaid', `graph ${direction}`];

    // Build dependency map
    const nodes = new Map<string, { name: string; type: string }>();
    const edges: Array<{ from: string; to: string }> = [];

    for (const chunk of chunks.slice(0, maxNodes)) {
      const nodeId = this.sanitizeId(`${chunk.file}:${chunk.name}`);
      nodes.set(nodeId, { name: chunk.name, type: chunk.type });

      if (chunk.dependencies) {
        for (const dep of chunk.dependencies) {
          edges.push({ from: nodeId, to: this.sanitizeId(dep) });
        }
      }
    }

    // Add nodes
    for (const [id, { name, type }] of nodes) {
      const shape = this.getNodeShape(type);
      lines.push(`  ${id}${shape.open}${name}${shape.close}`);
    }

    // Add edges
    for (const { from, to } of edges) {
      if (nodes.has(to) || nodes.has(from)) {
        lines.push(`  ${from} --> ${to}`);
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private groupByDirectory(files: FileChange[]): Record<string, FileChange[]> {
    const groups: Record<string, FileChange[]> = {};

    for (const file of files) {
      const dir = file.path.split('/').slice(0, -1).join('/') || 'root';
      if (!groups[dir]) {
        groups[dir] = [];
      }
      groups[dir].push(file);
    }

    return groups;
  }

  private sanitizeId(str: string): string {
    return str.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '');
  }

  private getFileStatusEmoji(status: string): string {
    switch (status) {
      case 'added':
        return '➕';
      case 'modified':
        return '📝';
      case 'deleted':
        return '🗑️';
      case 'renamed':
        return '📋';
      default:
        return '📄';
    }
  }

  private getNodeShape(type: string): { open: string; close: string } {
    switch (type) {
      case 'function':
      case 'method':
        return { open: '((', close: '))' };
      case 'class':
        return { open: '[[', close: ']]' };
      case 'interface':
        return { open: '{{', close: '}}' };
      case 'variable':
      case 'const':
        return { open: '[(', close: ')]' };
      default:
        return { open: '[', close: ']' };
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createDiagramGenerator(): DiagramGenerator {
  return new DiagramGenerator();
}
