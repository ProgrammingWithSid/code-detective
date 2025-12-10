/**
 * Fix Applier - Applies code fixes to files
 *
 * Features:
 * - Backup creation
 * - Dry run mode
 * - Conflict detection
 * - Syntax validation
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  CodeFix,
  FixApplicationOptions,
  FixApplicationResult,
  FixDiff,
  FixValidation,
  DEFAULT_APPLICATION_OPTIONS,
  FixConfidence,
} from '../types/autofix';

export class FixApplier {
  private options: FixApplicationOptions;

  constructor(options: FixApplicationOptions = {}) {
    this.options = { ...DEFAULT_APPLICATION_OPTIONS, ...options };
  }

  /**
   * Apply fixes to files
   */
  applyFixes(fixes: CodeFix[], fileContents: Map<string, string>): FixApplicationResult {
    const applied: FixApplicationResult['applied'] = [];
    const failed: FixApplicationResult['failed'] = [];
    const skipped: FixApplicationResult['skipped'] = [];
    const modifiedFiles = new Set<string>();

    // Group fixes by file
    const fixesByFile = this.groupFixesByFile(fixes);

    for (const [filePath, fileFixes] of fixesByFile) {
      const content = fileContents.get(filePath);

      if (!content) {
        for (const fix of fileFixes) {
          failed.push({ fix, reason: 'File content not found' });
        }
        continue;
      }

      // Sort fixes by line number (descending) to apply from bottom to top
      const sortedFixes = [...fileFixes].sort((a, b) => b.startLine - a.startLine);

      // Filter fixes based on options
      const applicableFixes: CodeFix[] = [];
      for (const fix of sortedFixes) {
        const skipReason = this.shouldSkipFix(fix);
        if (skipReason) {
          skipped.push({ fix, reason: skipReason });
        } else {
          applicableFixes.push(fix);
        }
      }

      // Check for conflicts
      const conflicts = this.detectConflicts(applicableFixes);
      for (const conflict of conflicts) {
        skipped.push({ fix: conflict, reason: 'Conflicts with another fix' });
      }

      const nonConflictingFixes = applicableFixes.filter((f) => !conflicts.includes(f));

      // Apply fixes
      let modifiedContent = content;

      for (const fix of nonConflictingFixes) {
        try {
          const result = this.applyFix(fix, modifiedContent);

          if (result.success) {
            modifiedContent = result.content;

            let backupPath: string | undefined;
            if (this.options.createBackup && !this.options.dryRun) {
              backupPath = this.createBackup(filePath, content);
            }

            applied.push({ fix, filePath, backupPath });
          } else {
            failed.push({ fix, reason: result.error || 'Unknown error' });
          }
        } catch (error) {
          failed.push({
            fix,
            reason: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Write modified content if not dry run
      if (!this.options.dryRun && applied.some((a) => a.filePath === filePath)) {
        // Validate syntax if enabled
        if (this.options.validateSyntax) {
          const isValid = this.validateSyntax(modifiedContent, filePath);
          if (!isValid) {
            // Revert applied fixes for this file
            const fileApplied = applied.filter((a) => a.filePath === filePath);
            for (const item of fileApplied) {
              applied.splice(applied.indexOf(item), 1);
              failed.push({ fix: item.fix, reason: 'Syntax validation failed' });
            }
            continue;
          }
        }

        // Actually write the file
        this.writeFile(filePath, modifiedContent);
        modifiedFiles.add(filePath);
      }
    }

    return {
      applied,
      failed,
      skipped,
      filesModified: modifiedFiles.size,
      isDryRun: this.options.dryRun || false,
    };
  }

  /**
   * Generate diff for fixes
   */
  generateDiff(fixes: CodeFix[], fileContent: string): FixDiff {
    let modifiedContent = fileContent;
    const appliedFixes: CodeFix[] = [];

    if (fixes.length === 0) {
      return {
        filePath: 'unknown',
        original: fileContent,
        fixed: fileContent,
        unifiedDiff: '',
        additions: 0,
        deletions: 0,
        fixesApplied: [],
      };
    }

    // Sort fixes by line number (descending)
    const sortedFixes = [...fixes].sort((a, b) => b.startLine - a.startLine);

    for (const fix of sortedFixes) {
      const result = this.applyFix(fix, modifiedContent);
      if (result.success) {
        modifiedContent = result.content;
        appliedFixes.push(fix);
      }
    }

    const originalLines = fileContent.split('\n');
    const fixedLines = modifiedContent.split('\n');

    const firstFix = fixes[0];
    const unifiedDiff = this.createUnifiedDiff(
      firstFix?.filePath || 'file',
      originalLines,
      fixedLines
    );

    return {
      filePath: firstFix?.filePath || 'unknown',
      original: fileContent,
      fixed: modifiedContent,
      unifiedDiff,
      additions: this.countAdditions(fileContent, modifiedContent),
      deletions: this.countDeletions(fileContent, modifiedContent),
      fixesApplied: appliedFixes,
    };
  }

  /**
   * Validate a fix before applying
   */
  validateFix(fix: CodeFix, fileContent: string): FixValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if target lines exist
    const lines = fileContent.split('\n');
    if (fix.startLine < 1 || fix.startLine > lines.length) {
      errors.push(`Start line ${fix.startLine} is out of range`);
    }
    if (fix.endLine < fix.startLine) {
      errors.push('End line cannot be before start line');
    }
    if (fix.endLine > lines.length) {
      errors.push(`End line ${fix.endLine} is out of range`);
    }

    // Check if original code matches
    if (fix.originalCode) {
      const targetLines = lines.slice(fix.startLine - 1, fix.endLine);
      const targetCode = targetLines.join('\n');

      if (!targetCode.includes(fix.originalCode.trim())) {
        warnings.push('Original code does not exactly match target location');
      }
    }

    // Check fix type validity
    if (fix.type === 'delete' && fix.fixedCode) {
      warnings.push('Delete fix has non-empty fixedCode');
    }
    if (fix.type === 'insert' && fix.originalCode) {
      warnings.push('Insert fix has non-empty originalCode');
    }

    // Check confidence
    if (fix.confidence === 'low') {
      warnings.push('Fix has low confidence - manual review recommended');
    }

    // Syntax validation
    let syntaxValid: boolean | undefined;
    if (errors.length === 0) {
      const result = this.applyFix(fix, fileContent);
      if (result.success) {
        syntaxValid = this.validateSyntax(result.content, fix.filePath);
        if (!syntaxValid) {
          warnings.push('Fix may produce invalid syntax');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      syntaxValid,
      semanticsPreserved: undefined, // Would need deeper analysis
    };
  }

  /**
   * Apply a single fix to content
   */
  private applyFix(
    fix: CodeFix,
    content: string
  ): { success: boolean; content: string; error?: string } {
    try {
      const lines = content.split('\n');

      switch (fix.type) {
        case 'replace': {
          const newLines = [...lines];
          newLines.splice(
            fix.startLine - 1,
            fix.endLine - fix.startLine + 1,
            ...fix.fixedCode.split('\n')
          );
          return { success: true, content: newLines.join('\n') };
        }

        case 'insert': {
          const newLines = [...lines];
          newLines.splice(fix.startLine - 1, 0, ...fix.fixedCode.split('\n'));
          return { success: true, content: newLines.join('\n') };
        }

        case 'delete': {
          const newLines = [...lines];
          newLines.splice(fix.startLine - 1, fix.endLine - fix.startLine + 1);
          return { success: true, content: newLines.join('\n') };
        }

        case 'wrap': {
          const targetLines = lines.slice(fix.startLine - 1, fix.endLine);
          const wrapped = fix.fixedCode.replace('$CODE', targetLines.join('\n'));
          const newLines = [...lines];
          newLines.splice(
            fix.startLine - 1,
            fix.endLine - fix.startLine + 1,
            ...wrapped.split('\n')
          );
          return { success: true, content: newLines.join('\n') };
        }

        case 'refactor': {
          // For refactors, the fixedCode should be the complete replacement
          const newLines = [...lines];
          newLines.splice(
            fix.startLine - 1,
            fix.endLine - fix.startLine + 1,
            ...fix.fixedCode.split('\n')
          );
          return { success: true, content: newLines.join('\n') };
        }

        default:
          return { success: false, error: `Unknown fix type: ${String(fix.type)}`, content };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        content,
      };
    }
  }

  /**
   * Check if a fix should be skipped based on options
   */
  private shouldSkipFix(fix: CodeFix): string | null {
    if (this.options.autoApplicableOnly && !fix.isAutoApplicable) {
      return 'Fix is not auto-applicable';
    }

    const confidenceOrder: FixConfidence[] = ['low', 'medium', 'high'];
    const threshold = this.options.minConfidence || 'high';

    if (confidenceOrder.indexOf(fix.confidence) < confidenceOrder.indexOf(threshold)) {
      return `Fix confidence (${fix.confidence}) below threshold (${threshold})`;
    }

    return null;
  }

  /**
   * Detect conflicting fixes
   */
  private detectConflicts(fixes: CodeFix[]): CodeFix[] {
    const conflicts: CodeFix[] = [];

    for (let i = 0; i < fixes.length; i++) {
      for (let j = i + 1; j < fixes.length; j++) {
        const fixI = fixes[i];
        const fixJ = fixes[j];
        if (!fixI || !fixJ) continue;

        if (this.fixesOverlap(fixI, fixJ)) {
          // Mark the lower confidence fix as conflicting
          if (this.getConfidenceValue(fixI.confidence) < this.getConfidenceValue(fixJ.confidence)) {
            conflicts.push(fixI);
          } else {
            conflicts.push(fixJ);
          }
        }
      }
    }

    return [...new Set(conflicts)];
  }

  /**
   * Check if two fixes overlap
   */
  private fixesOverlap(fix1: CodeFix, fix2: CodeFix): boolean {
    if (fix1.filePath !== fix2.filePath) return false;

    return !(fix1.endLine < fix2.startLine || fix2.endLine < fix1.startLine);
  }

  /**
   * Get numeric confidence value
   */
  private getConfidenceValue(confidence: FixConfidence): number {
    return { low: 1, medium: 2, high: 3 }[confidence];
  }

  /**
   * Group fixes by file path
   */
  private groupFixesByFile(fixes: CodeFix[]): Map<string, CodeFix[]> {
    const grouped = new Map<string, CodeFix[]>();

    for (const fix of fixes) {
      const existing = grouped.get(fix.filePath) || [];
      existing.push(fix);
      grouped.set(fix.filePath, existing);
    }

    return grouped;
  }

  /**
   * Create backup of file
   */
  private createBackup(filePath: string, content: string): string {
    const backupDir = this.options.backupDir || '.sherlock-backup';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `${filePath.replace(/\//g, '_')}.${timestamp}.bak`);

    if (!existsSync(dirname(backupPath))) {
      mkdirSync(dirname(backupPath), { recursive: true });
    }

    writeFileSync(backupPath, content);
    return backupPath;
  }

  /**
   * Write file
   */
  private writeFile(filePath: string, content: string): void {
    if (!existsSync(dirname(filePath))) {
      mkdirSync(dirname(filePath), { recursive: true });
    }
    writeFileSync(filePath, content);
  }

  /**
   * Validate syntax (basic check)
   */
  private validateSyntax(content: string, filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase();

    // Basic bracket matching for JS/TS
    if (['js', 'ts', 'jsx', 'tsx'].includes(ext || '')) {
      let braces = 0;
      let brackets = 0;
      let parens = 0;

      for (const char of content) {
        if (char === '{') braces++;
        if (char === '}') braces--;
        if (char === '[') brackets++;
        if (char === ']') brackets--;
        if (char === '(') parens++;
        if (char === ')') parens--;

        if (braces < 0 || brackets < 0 || parens < 0) {
          return false;
        }
      }

      return braces === 0 && brackets === 0 && parens === 0;
    }

    // For other languages, assume valid
    return true;
  }

  /**
   * Create unified diff string
   */
  private createUnifiedDiff(
    filePath: string,
    originalLines: string[],
    fixedLines: string[]
  ): string {
    const diff: string[] = [];
    diff.push(`--- a/${filePath}`);
    diff.push(`+++ b/${filePath}`);

    // Simple line-by-line diff
    const maxLines = Math.max(originalLines.length, fixedLines.length);
    let hunkStart = -1;
    let hunkLines: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const orig = originalLines[i];
      const fixed = fixedLines[i];

      if (orig !== fixed) {
        if (hunkStart === -1) {
          hunkStart = i;
          // Add context before
          for (let c = Math.max(0, i - 3); c < i; c++) {
            hunkLines.push(` ${originalLines[c]}`);
          }
        }

        if (orig !== undefined) {
          hunkLines.push(`-${orig}`);
        }
        if (fixed !== undefined) {
          hunkLines.push(`+${fixed}`);
        }
      } else if (hunkStart !== -1) {
        // Add context after
        hunkLines.push(` ${orig}`);

        // Check if we should close the hunk
        const nextDiff = this.findNextDiff(originalLines, fixedLines, i + 1);
        if (nextDiff === -1 || nextDiff > i + 3) {
          // Close hunk
          for (
            let c = i + 1;
            c < Math.min(i + 4, maxLines) && originalLines[c] === fixedLines[c];
            c++
          ) {
            hunkLines.push(` ${originalLines[c]}`);
          }

          diff.push(
            `@@ -${hunkStart + 1},${hunkLines.filter((l) => !l.startsWith('+')).length} +${hunkStart + 1},${hunkLines.filter((l) => !l.startsWith('-')).length} @@`
          );
          diff.push(...hunkLines);

          hunkStart = -1;
          hunkLines = [];
        }
      }
    }

    // Close any remaining hunk
    if (hunkStart !== -1) {
      diff.push(
        `@@ -${hunkStart + 1},${hunkLines.filter((l) => !l.startsWith('+')).length} +${hunkStart + 1},${hunkLines.filter((l) => !l.startsWith('-')).length} @@`
      );
      diff.push(...hunkLines);
    }

    return diff.join('\n');
  }

  /**
   * Find next diff position
   */
  private findNextDiff(original: string[], fixed: string[], start: number): number {
    const max = Math.max(original.length, fixed.length);
    for (let i = start; i < max; i++) {
      if (original[i] !== fixed[i]) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Count additions
   */
  private countAdditions(original: string, fixed: string): number {
    const origLines = original.split('\n').length;
    const fixedLines = fixed.split('\n').length;
    return Math.max(0, fixedLines - origLines);
  }

  /**
   * Count deletions
   */
  private countDeletions(original: string, fixed: string): number {
    const origLines = original.split('\n').length;
    const fixedLines = fixed.split('\n').length;
    return Math.max(0, origLines - fixedLines);
  }
}

/**
 * Factory function
 */
export function createFixApplier(options?: FixApplicationOptions): FixApplier {
  return new FixApplier(options);
}
