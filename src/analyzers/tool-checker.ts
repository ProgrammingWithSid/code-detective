/**
 * Tool Availability Checker
 *
 * Checks if required linter and SAST tools are available before running analysis
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { LinterTool } from './linter-integration';
import { SASTTool } from './sast-integration';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface ToolAvailability {
  tool: string;
  available: boolean;
  version?: string;
  error?: string;
  installCommand?: string;
}

export interface ToolCheckResult {
  available: ToolAvailability[];
  missing: ToolAvailability[];
  allAvailable: boolean;
}

// ============================================================================
// Tool Checker Class
// ============================================================================

export class ToolChecker {
  /**
   * Check if a linter tool is available
   */
  static async checkLinterTool(tool: LinterTool): Promise<ToolAvailability> {
    switch (tool) {
      case 'eslint':
        return this.checkNpxTool('eslint', 'npm install -g eslint');
      case 'prettier':
        return this.checkNpxTool('prettier', 'npm install -g prettier');
      case 'typescript':
        return this.checkNpxTool('tsc', 'npm install -g typescript');
      case 'pylint':
        return this.checkCommand('pylint', 'pip install pylint');
      case 'rubocop':
        return this.checkCommand('rubocop', 'gem install rubocop');
      case 'golangci-lint':
        return this.checkCommand('golangci-lint', 'brew install golangci-lint');
      case 'rust-clippy':
        return this.checkCommand('cargo', 'rustup component add clippy');
      case 'custom':
        return { tool: 'custom', available: true }; // Custom tools are user-defined
      default:
        return { tool, available: false, error: 'Unknown tool' };
    }
  }

  /**
   * Check if a SAST tool is available
   */
  static async checkSASTTool(tool: SASTTool): Promise<ToolAvailability> {
    switch (tool) {
      case 'semgrep':
        return this.checkCommand('semgrep', 'pip install semgrep');
      case 'bandit':
        return this.checkCommand('bandit', 'pip install bandit');
      case 'gosec':
        return this.checkCommand(
          'gosec',
          'go install github.com/securego/gosec/v2/cmd/gosec@latest'
        );
      case 'brakeman':
        return this.checkCommand('brakeman', 'gem install brakeman');
      case 'npm-audit':
        return this.checkCommand('npm', 'npm comes with Node.js'); // npm is always available if Node.js is installed
      case 'snyk':
        return this.checkCommand('snyk', 'npm install -g snyk');
      case 'sonarqube':
        return this.checkCommand('sonar-scanner', 'brew install sonar-scanner');
      case 'custom':
        return { tool: 'custom', available: true }; // Custom tools are user-defined
      default:
        return { tool, available: false, error: 'Unknown tool' };
    }
  }

  /**
   * Check multiple linter tools
   */
  static async checkLinterTools(tools: LinterTool[]): Promise<ToolCheckResult> {
    const results = await Promise.all(tools.map((tool) => this.checkLinterTool(tool)));
    return this.processResults(results);
  }

  /**
   * Check multiple SAST tools
   */
  static async checkSASTTools(tools: SASTTool[]): Promise<ToolCheckResult> {
    const results = await Promise.all(tools.map((tool) => this.checkSASTTool(tool)));
    return this.processResults(results);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Check if a command is available (for tools that need to be in PATH)
   */
  private static async checkCommand(
    command: string,
    installCommand: string
  ): Promise<ToolAvailability> {
    try {
      const { stdout } = await execAsync(`which ${command}`, { timeout: 5000 });
      if (stdout.trim()) {
        // Try to get version
        try {
          const versionOutput = await execAsync(`${command} --version`, { timeout: 5000 });
          return {
            tool: command,
            available: true,
            version: versionOutput.stdout.trim().split('\n')[0],
            installCommand,
          };
        } catch {
          return {
            tool: command,
            available: true,
            installCommand,
          };
        }
      }
    } catch (error) {
      return {
        tool: command,
        available: false,
        error: error instanceof Error ? error.message : String(error),
        installCommand,
      };
    }

    return {
      tool: command,
      available: false,
      error: 'Command not found in PATH',
      installCommand,
    };
  }

  /**
   * Check if an npx tool is available (tools that can be run via npx)
   */
  private static async checkNpxTool(
    tool: string,
    installCommand: string
  ): Promise<ToolAvailability> {
    try {
      // npx will download and run the tool if not installed
      // We just check if npx is available
      const { stdout } = await execAsync('which npx', { timeout: 5000 });
      if (stdout.trim()) {
        // Try to run the tool via npx to see if it's accessible
        try {
          const versionOutput = await execAsync(`npx ${tool} --version`, {
            timeout: 10000,
            maxBuffer: 1024 * 1024, // 1MB
          });
          return {
            tool,
            available: true,
            version: versionOutput.stdout.trim().split('\n')[0],
            installCommand,
          };
        } catch {
          // npx is available, tool will be downloaded on-demand
          return {
            tool,
            available: true,
            version: 'Available via npx',
            installCommand,
          };
        }
      }
    } catch (error) {
      return {
        tool,
        available: false,
        error: 'npx not found. Install Node.js to use npx.',
        installCommand: 'Install Node.js from https://nodejs.org/',
      };
    }

    return {
      tool,
      available: false,
      error: 'npx not found',
      installCommand: 'Install Node.js from https://nodejs.org/',
    };
  }

  /**
   * Process check results into a summary
   */
  private static processResults(results: ToolAvailability[]): ToolCheckResult {
    const available = results.filter((r) => r.available);
    const missing = results.filter((r) => !r.available);

    return {
      available,
      missing,
      allAvailable: missing.length === 0,
    };
  }

  /**
   * Format check results as a readable message
   */
  static formatCheckResults(result: ToolCheckResult): string {
    const lines: string[] = [];

    if (result.available.length > 0) {
      lines.push('✅ Available tools:');
      for (const tool of result.available) {
        lines.push(`   - ${tool.tool}${tool.version ? ` (${tool.version})` : ''}`);
      }
    }

    if (result.missing.length > 0) {
      lines.push('\n❌ Missing tools:');
      for (const tool of result.missing) {
        lines.push(`   - ${tool.tool}`);
        if (tool.installCommand) {
          lines.push(`     Install: ${tool.installCommand}`);
        }
        if (tool.error) {
          lines.push(`     Error: ${tool.error}`);
        }
      }
      lines.push(
        '\n💡 Tip: Code Sherlock will skip unavailable tools and continue with available ones.'
      );
      lines.push('   See docs/TOOL_INSTALLATION.md for installation instructions.');
    }

    return lines.join('\n');
  }
}
