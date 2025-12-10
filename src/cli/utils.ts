/**
 * CLI Utilities
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { glob } from 'glob';
import { join, relative, resolve } from 'path';

/**
 * Configuration type
 */
interface SherlockConfig {
  model: string;
  rules: Record<string, unknown>;
  ignore: string[];
  [key: string]: unknown;
}

/**
 * Load configuration from file
 */
export function loadConfig(configPath: string, options: Partial<SherlockConfig>): SherlockConfig {
  const defaults: SherlockConfig = {
    model: 'gpt-4',
    rules: {},
    ignore: [],
  };

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as Partial<SherlockConfig>;
      return { ...defaults, ...config, ...options };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Could not parse config file: ${errorMsg}`);
    }
  }

  return { ...defaults, ...options };
}

/**
 * Get files to process
 */
export async function getFiles(
  basePath: string,
  options: {
    specific?: string[];
    ignore?: string[];
    extensions?: string[];
  }
): Promise<string[]> {
  const {
    specific,
    ignore = [],
    extensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'java'],
  } = options;

  // If specific files provided, use those
  if (specific && specific.length > 0) {
    return specific.filter((f) => existsSync(resolve(basePath, f)));
  }

  // Otherwise, scan directory
  const defaultIgnore = [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    '**/*.test.*',
    '**/*.spec.*',
    '__tests__/**',
    'coverage/**',
  ];

  const allIgnore = [...defaultIgnore, ...ignore];

  try {
    const pattern = `**/*.{${extensions.join(',')}}`;
    const matches = await glob(pattern, {
      cwd: basePath,
      ignore: allIgnore,
      nodir: true,
    });

    return matches;
  } catch {
    // Fallback to manual directory scan
    return scanDirectory(basePath, extensions, allIgnore);
  }
}

/**
 * Manual directory scan fallback
 */
function scanDirectory(
  dir: string,
  extensions: string[],
  ignore: string[],
  basePath?: string
): string[] {
  const base = basePath || dir;
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = relative(base, fullPath);

      // Check if should ignore
      if (shouldIgnore(relativePath, ignore)) {
        continue;
      }

      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...scanDirectory(fullPath, extensions, ignore, base));
      } else if (stat.isFile()) {
        const ext = entry.split('.').pop()?.toLowerCase();
        if (ext && extensions.includes(ext)) {
          files.push(relativePath);
        }
      }
    }
  } catch (error) {
    // Ignore errors (permission issues, etc.)
  }

  return files;
}

/**
 * Check if path should be ignored
 */
function shouldIgnore(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Simple glob matching
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\//g, '\\/')
      );
      if (regex.test(path)) {
        return true;
      }
    } else if (path.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Format output based on type
 */
export function formatOutput(data: unknown, format: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'markdown':
      return formatMarkdown(data);
    default:
      return String(data);
  }
}

/**
 * Format data as markdown
 */
function formatMarkdown(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => `- ${JSON.stringify(item)}`).join('\n');
  }

  return '```json\n' + JSON.stringify(data, null, 2) + '\n```';
}

/**
 * Get severity color
 */
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'error':
      return '\x1b[31m'; // Red
    case 'warning':
      return '\x1b[33m'; // Yellow
    case 'info':
      return '\x1b[36m'; // Cyan
    default:
      return '\x1b[0m'; // Reset
  }
}

/**
 * Format file size
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
