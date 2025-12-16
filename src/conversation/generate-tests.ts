/**
 * Test Generation Module
 *
 * Generates unit tests for code
 */

export interface TestGenerationOptions {
  /** Testing framework */
  framework?: 'jest' | 'mocha' | 'vitest' | 'pytest';
  /** Include edge cases */
  includeEdgeCases?: boolean;
  /** Include mocks */
  includeMocks?: boolean;
}

export interface GeneratedTest {
  /** Test name */
  name: string;
  /** Test code */
  code: string;
  /** What it tests */
  tests: string;
  /** Type of test */
  type: 'happy-path' | 'edge-case' | 'error-handling';
}

export interface TestGenerationResult {
  /** Generated test file content */
  testFile: string;
  /** Individual tests */
  tests: GeneratedTest[];
  /** Imports needed */
  imports: string[];
  /** Mocks generated */
  mocks: string[];
  /** Coverage estimate */
  coverageEstimate: number;
}

const TEMPLATES = {
  jest: {
    describe: (name: string, tests: string): string => `describe('${name}', () => {\n${tests}\n});`,
    it: (name: string, code: string): string => `  it('${name}', () => {\n${code}\n  });`,
    itAsync: (name: string, code: string): string =>
      `  it('${name}', async () => {\n${code}\n  });`,
    expect: (actual: string, matcher: string, expected?: string): string =>
      expected
        ? `    expect(${actual}).${matcher}(${expected});`
        : `    expect(${actual}).${matcher}();`,
  },
};

export class TestGenerator {
  /**
   * Generate tests for code
   */
  generateTests(
    code: string,
    filename: string,
    options: TestGenerationOptions = {}
  ): TestGenerationResult {
    const framework = options.framework || 'jest';
    const analysis = this.analyzeCode(code, filename);
    const tests = this.generateTestCases(analysis, framework, options);
    const testFile = this.buildTestFile(tests, analysis, framework, filename);

    return {
      testFile,
      tests: tests.cases,
      imports: tests.imports,
      mocks: tests.mocks,
      coverageEstimate: this.estimateCoverage(tests.cases, analysis),
    };
  }

  private analyzeCode(code: string, filename: string): CodeAnalysis {
    return {
      filename,
      functions: this.extractFunctions(code),
      classes: this.extractClasses(code),
      exports: this.extractExports(code),
      imports: this.extractImports(code),
      hasAsync: /async\s+|await\s+/.test(code),
    };
  }

  private generateTestCases(
    analysis: CodeAnalysis,
    framework: string,
    options: TestGenerationOptions
  ): { cases: GeneratedTest[]; imports: string[]; mocks: string[] } {
    const cases: GeneratedTest[] = [];
    const imports: string[] = [];
    const mocks: string[] = [];

    const baseFilename = analysis.filename.replace(/\.(ts|js)x?$/, '');
    if (analysis.exports.length > 0) {
      imports.push(`import { ${analysis.exports.join(', ')} } from './${baseFilename}';`);
    }

    for (const func of analysis.functions) {
      cases.push(this.generateHappyPathTest(func, framework));

      if (options.includeEdgeCases) {
        cases.push(...this.generateEdgeCaseTests(func, framework));
      }
    }

    for (const cls of analysis.classes) {
      cases.push(this.generateClassTest(cls, framework));
    }

    if (options.includeMocks) {
      for (const imp of analysis.imports) {
        if (!imp.startsWith('.')) {
          mocks.push(imp);
        }
      }
    }

    return { cases, imports, mocks };
  }

  private generateHappyPathTest(func: FunctionInfo, _framework: string): GeneratedTest {
    const template = TEMPLATES.jest;
    const isAsync = func.async;

    let testCode = `    // Arrange\n`;
    if (func.params.length > 0) {
      testCode += func.params
        .map((p) => `    const ${p.name} = ${this.getDefaultValue(p.type)};`)
        .join('\n');
      testCode += '\n\n';
    }

    testCode += `    // Act\n`;
    const call =
      func.params.length > 0
        ? `${func.name}(${func.params.map((p) => p.name).join(', ')})`
        : `${func.name}()`;

    testCode += isAsync
      ? `    const result = await ${call};\n\n`
      : `    const result = ${call};\n\n`;

    testCode += `    // Assert\n`;
    testCode += template.expect('result', 'toBeDefined');

    const testName = `should ${this.describeFunction(func.name)} correctly`;

    return {
      name: testName,
      code: isAsync ? template.itAsync(testName, testCode) : template.it(testName, testCode),
      tests: func.name,
      type: 'happy-path',
    };
  }

  private generateEdgeCaseTests(func: FunctionInfo, _framework: string): GeneratedTest[] {
    const tests: GeneratedTest[] = [];
    const template = TEMPLATES.jest;

    for (const param of func.params) {
      if (!param.required) continue;

      const testCode =
        `    // Act & Assert\n` + template.expect(`() => ${func.name}(null)`, 'toThrow');
      const testName = `should handle null ${param.name}`;

      tests.push({
        name: testName,
        code: template.it(testName, testCode),
        tests: `${func.name} - null handling`,
        type: 'edge-case',
      });
    }

    return tests;
  }

  private generateClassTest(cls: ClassInfo, _framework: string): GeneratedTest {
    const template = TEMPLATES.jest;
    const testCode =
      `    const instance = new ${cls.name}();\n    ` +
      template.expect('instance', 'toBeInstanceOf', cls.name);
    const testName = `should create instance of ${cls.name}`;

    return {
      name: testName,
      code: template.it(testName, testCode),
      tests: cls.name,
      type: 'happy-path',
    };
  }

  private buildTestFile(
    tests: { cases: GeneratedTest[]; imports: string[]; mocks: string[] },
    _analysis: CodeAnalysis,
    _framework: string,
    filename: string
  ): string {
    const template = TEMPLATES.jest;
    const lines: string[] = [];

    if (tests.imports.length > 0) {
      lines.push(tests.imports.join('\n'));
      lines.push('');
    }

    if (tests.mocks.length > 0) {
      lines.push('// Mocks');
      for (const mock of tests.mocks) {
        lines.push(`jest.mock('${mock}');`);
      }
      lines.push('');
    }

    const testName =
      filename
        .replace(/\.(ts|js)x?$/, '')
        .split('/')
        .pop() || 'Module';
    const testContent = tests.cases.map((t) => t.code).join('\n\n');

    lines.push(template.describe(testName, testContent));

    return lines.join('\n');
  }

  private extractFunctions(code: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const funcMatch = line.match(/(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
      if (funcMatch && funcMatch[3]) {
        functions.push({
          name: funcMatch[3],
          async: !!funcMatch[2],
          exported: !!funcMatch[1],
          params: this.parseParams(funcMatch[4] || ''),
        });
      }

      const arrowMatch = line.match(
        /(export\s+)?(?:const|let)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/
      );
      if (arrowMatch && arrowMatch[2]) {
        const paramsMatch = line.match(/\(([^)]*)\)/);
        functions.push({
          name: arrowMatch[2],
          async: !!arrowMatch[3],
          exported: !!arrowMatch[1],
          params: this.parseParams(paramsMatch?.[1] || ''),
        });
      }
    }

    return functions;
  }

  private extractClasses(code: string): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const matches = code.matchAll(/(export\s+)?class\s+(\w+)/g);

    for (const match of matches) {
      if (match[2]) {
        classes.push({ name: match[2], exported: !!match[1] });
      }
    }

    return classes;
  }

  private extractExports(code: string): string[] {
    const exports: string[] = [];
    const matches = code.matchAll(
      /export\s+(?:const|let|function|class|async\s+function)\s+(\w+)/g
    );

    for (const match of matches) {
      if (match[1]) exports.push(match[1]);
    }

    return [...new Set(exports)];
  }

  private extractImports(code: string): string[] {
    const imports: string[] = [];
    const matches = code.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/g);

    for (const match of matches) {
      if (match[1]) imports.push(match[1]);
    }

    return imports;
  }

  private parseParams(paramsStr: string): ParamInfo[] {
    if (!paramsStr.trim()) return [];

    return paramsStr.split(',').map((p) => {
      const parts = p.trim().split(/:\s*/);
      const name = parts[0]?.replace(/[?=].*/, '').trim() || 'param';
      const type = parts[1]?.trim();
      const required = !p.includes('?') && !p.includes('=');
      return { name, type, required };
    });
  }

  private getDefaultValue(type?: string): string {
    if (!type) return 'undefined';
    const t = type.toLowerCase();
    if (t.includes('string')) return "'test'";
    if (t.includes('number')) return '42';
    if (t.includes('boolean')) return 'true';
    if (t.includes('[]')) return '[]';
    return '{}';
  }

  private describeFunction(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
  }

  private estimateCoverage(tests: GeneratedTest[], analysis: CodeAnalysis): number {
    const total = analysis.functions.length + analysis.classes.length;
    if (total === 0) return 100;
    const tested = new Set(tests.map((t) => t.tests.split(' - ')[0])).size;
    return Math.round((tested / total) * 100);
  }
}

interface CodeAnalysis {
  filename: string;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  exports: string[];
  imports: string[];
  hasAsync: boolean;
}

interface FunctionInfo {
  name: string;
  async: boolean;
  exported: boolean;
  params: ParamInfo[];
}

interface ParamInfo {
  name: string;
  type?: string;
  required: boolean;
}

interface ClassInfo {
  name: string;
  exported: boolean;
}

/**
 * Factory function
 */
export function createTestGenerator(): TestGenerator {
  return new TestGenerator();
}

/**
 * Format tests as markdown
 */
export function formatTestsAsMarkdown(result: TestGenerationResult): string {
  const lines: string[] = [];

  lines.push('## 🧪 Generated Tests\n');
  lines.push(`**Coverage Estimate:** ${result.coverageEstimate}%\n`);

  lines.push('### Tests\n');
  for (const test of result.tests) {
    const emoji = test.type === 'happy-path' ? '✅' : test.type === 'edge-case' ? '🔲' : '❌';
    lines.push(`- ${emoji} ${test.name}`);
  }
  lines.push('');

  lines.push('```typescript');
  lines.push(result.testFile);
  lines.push('```');

  return lines.join('\n');
}
