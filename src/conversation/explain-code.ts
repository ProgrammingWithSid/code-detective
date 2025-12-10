/**
 * Code Explanation Engine
 *
 * Provides AI-powered code explanations
 */

export interface ExplanationOptions {
  /** Detail level */
  detailLevel?: 'brief' | 'normal' | 'detailed';
  /** Target audience */
  audience?: 'beginner' | 'intermediate' | 'expert';
  /** Focus areas */
  focus?: string[];
}

export interface CodeExplanation {
  /** Brief summary */
  summary: string;
  /** Detailed explanation */
  explanation: string;
  /** Key concepts used */
  concepts: string[];
  /** Design patterns identified */
  patterns: string[];
  /** Complexity assessment */
  complexity: {
    level: 'simple' | 'moderate' | 'complex';
    factors: string[];
  };
  /** Dependencies and imports */
  dependencies: string[];
}

export class CodeExplainer {
  /**
   * Explain code
   */
  explain(code: string, filename: string, _options: ExplanationOptions = {}): CodeExplanation {
    const concepts = this.extractConcepts(code);
    const patterns = this.detectPatterns(code);
    const complexity = this.assessComplexity(code);
    const dependencies = this.extractImports(code);
    const summary = this.generateSummary(code, filename);

    return {
      summary,
      explanation: summary,
      concepts,
      patterns,
      complexity,
      dependencies,
    };
  }

  /**
   * Generate a walkthrough of the code
   */
  walkthrough(code: string, _filename: string): string[] {
    const steps: string[] = [];
    const imports = this.extractImports(code);
    const functions = this.extractFunctions(code);
    const classes = this.extractClasses(code);

    if (imports.length > 0) {
      steps.push(`**Imports**: ${imports.length} module(s): ${imports.slice(0, 5).join(', ')}`);
    }

    for (const cls of classes) {
      steps.push(`**Class \`${cls.name}\`**: Defined at line ${cls.line}`);
    }

    for (const fn of functions.slice(0, 10)) {
      steps.push(`**Function \`${fn.name}\`**: ${fn.async ? 'Async' : 'Sync'} at line ${fn.line}`);
    }

    if (steps.length === 0) {
      steps.push(`This file contains ${code.split('\n').length} lines of code.`);
    }

    return steps;
  }

  private generateSummary(code: string, filename: string): string {
    const lines = code.split('\n').length;
    const functions = this.extractFunctions(code);
    const classes = this.extractClasses(code);
    const lang = this.detectLanguage(filename);

    let summary = `This is a ${lang} file with ${lines} lines.`;
    if (classes.length > 0) {
      summary += ` It defines ${classes.length} class(es).`;
    }
    if (functions.length > 0) {
      summary += ` It contains ${functions.length} function(s).`;
    }
    return summary;
  }

  private extractConcepts(code: string): string[] {
    const concepts: string[] = [];
    if (/async\s+|await\s+/.test(code)) concepts.push('async/await');
    if (/Promise/.test(code)) concepts.push('Promises');
    if (/class\s+\w+/.test(code)) concepts.push('Classes');
    if (/interface\s+\w+/.test(code)) concepts.push('Interfaces');
    if (/=>\s*{|=>\s*\w/.test(code)) concepts.push('Arrow functions');
    if (/\.map\(|\.filter\(|\.reduce\(/.test(code)) concepts.push('Array methods');
    if (/try\s*{/.test(code)) concepts.push('Error handling');
    if (/export\s+/.test(code)) concepts.push('ES Modules');
    if (/useState|useEffect/.test(code)) concepts.push('React Hooks');
    return [...new Set(concepts)];
  }

  private detectPatterns(code: string): string[] {
    const patterns: string[] = [];
    if (/getInstance|_instance/.test(code)) patterns.push('Singleton');
    if (/Factory|create\w+/.test(code)) patterns.push('Factory');
    if (/Observer|subscribe|notify/.test(code)) patterns.push('Observer');
    if (/middleware|next\(/.test(code)) patterns.push('Middleware');
    return [...new Set(patterns)];
  }

  private assessComplexity(code: string): {
    level: 'simple' | 'moderate' | 'complex';
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;

    const lines = code.split('\n').length;
    if (lines > 200) {
      score += 2;
      factors.push('Long file');
    } else if (lines > 100) {
      score += 1;
    }

    const conditionals = (code.match(/if\s*\(|switch\s*\(|\?\s*:/g) || []).length;
    if (conditionals > 10) {
      score += 2;
      factors.push('Many conditionals');
    }

    if (/async|await|Promise/i.test(code)) {
      score += 1;
      factors.push('Async operations');
    }

    if (factors.length === 0) factors.push('Straightforward logic');

    return {
      level: score >= 4 ? 'complex' : score >= 2 ? 'moderate' : 'simple',
      factors,
    };
  }

  private extractImports(code: string): string[] {
    const imports: string[] = [];
    const matches = code.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/g);
    for (const match of matches) {
      if (match[1]) imports.push(match[1]);
    }
    return [...new Set(imports)];
  }

  private extractFunctions(code: string): Array<{ name: string; line: number; async: boolean }> {
    const functions: Array<{ name: string; line: number; async: boolean }> = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const funcMatch = line.match(/(async\s+)?function\s+(\w+)/);
      if (funcMatch && funcMatch[2]) {
        functions.push({ name: funcMatch[2], line: i + 1, async: !!funcMatch[1] });
      }

      const arrowMatch = line.match(/(?:const|let)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/);
      if (arrowMatch && arrowMatch[1]) {
        functions.push({ name: arrowMatch[1], line: i + 1, async: !!arrowMatch[2] });
      }
    }

    return functions;
  }

  private extractClasses(code: string): Array<{ name: string; line: number }> {
    const classes: Array<{ name: string; line: number }> = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const match = line.match(/class\s+(\w+)/);
      if (match && match[1]) {
        classes.push({ name: match[1], line: i + 1 });
      }
    }

    return classes;
  }

  private detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      ts: 'TypeScript',
      tsx: 'TypeScript/React',
      js: 'JavaScript',
      jsx: 'JavaScript/React',
      py: 'Python',
      go: 'Go',
      java: 'Java',
    };
    return map[ext] || 'code';
  }
}

/**
 * Format explanation as markdown
 */
export function formatExplanationAsMarkdown(explanation: CodeExplanation): string {
  const lines: string[] = [];

  lines.push('## 📖 Code Explanation\n');
  lines.push(`**Summary:** ${explanation.summary}\n`);

  if (explanation.concepts.length > 0) {
    lines.push('### 💡 Concepts\n');
    lines.push(explanation.concepts.map((c) => `- ${c}`).join('\n'));
    lines.push('');
  }

  if (explanation.patterns.length > 0) {
    lines.push('### 🎨 Design Patterns\n');
    lines.push(explanation.patterns.map((p) => `- ${p}`).join('\n'));
    lines.push('');
  }

  const emoji =
    explanation.complexity.level === 'simple'
      ? '🟢'
      : explanation.complexity.level === 'moderate'
        ? '🟡'
        : '🔴';
  lines.push(`### 📊 Complexity: ${emoji} ${explanation.complexity.level}\n`);
  lines.push(explanation.complexity.factors.map((f) => `- ${f}`).join('\n'));

  return lines.join('\n');
}

/**
 * Factory function
 */
export function createCodeExplainer(): CodeExplainer {
  return new CodeExplainer();
}
