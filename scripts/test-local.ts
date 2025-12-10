#!/usr/bin/env npx ts-node
/**
 * Local Testing Script for Code-Sherlock
 * 
 * Tests various features against a local repository
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  createSecurityAnalyzer,
  createPerformanceAnalyzer,
  createCodeExplainer,
  createTestGenerator,
} from '../src';

// Configuration
const TARGET_REPO = process.argv[2] || '/Users/dev-satender/Desktop/sid/helpdesk';
const TARGET_DIR = process.argv[3] || 'helpdesk-next/src'; // Vue 3 code

async function main() {
  console.log('🔍 Code-Sherlock Local Test\n');
  console.log(`📁 Target: ${TARGET_REPO}/${TARGET_DIR}\n`);

  // Find some TypeScript/Vue files to analyze
  const files = findFiles(path.join(TARGET_REPO, TARGET_DIR), ['.ts', '.tsx', '.vue', '.js']);
  
  if (files.length === 0) {
    console.log('❌ No files found to analyze');
    return;
  }

  console.log(`📄 Found ${files.length} files to analyze\n`);

  // Take first 5 files for quick testing
  const sampleFiles = files.slice(0, 5).map(f => ({
    path: f,
    content: fs.readFileSync(f, 'utf-8'),
  }));

  // 1. Security Analysis
  console.log('═══════════════════════════════════════');
  console.log('🔒 SECURITY ANALYSIS');
  console.log('═══════════════════════════════════════\n');

  const security = createSecurityAnalyzer({ minSeverity: 'info' });
  const securityResult = security.analyze(sampleFiles);

  console.log(security.formatAsMarkdown(securityResult));
  console.log('\n');

  // 2. Performance Analysis
  console.log('═══════════════════════════════════════');
  console.log('⚡ PERFORMANCE ANALYSIS');
  console.log('═══════════════════════════════════════\n');

  const perf = createPerformanceAnalyzer({ focus: 'frontend' });
  const perfResult = perf.analyze(sampleFiles);

  console.log(perf.formatAsMarkdown(perfResult));
  console.log('\n');

  // 3. Code Explanation (first file)
  if (sampleFiles.length > 0) {
    console.log('═══════════════════════════════════════');
    console.log('📖 CODE EXPLANATION');
    console.log('═══════════════════════════════════════\n');

    const explainer = createCodeExplainer();
    const firstFile = sampleFiles[0];
    const explanation = await explainer.explain(firstFile.content, firstFile.path);

    console.log(`File: ${path.basename(firstFile.path)}`);
    console.log(`Summary: ${explanation.summary}`);
    console.log(`Concepts: ${explanation.concepts.join(', ') || 'None detected'}`);
    console.log(`Patterns: ${explanation.patterns.join(', ') || 'None detected'}`);
    console.log(`Complexity: ${explanation.complexity.level} (${explanation.complexity.factors.join(', ')})`);
    console.log('\n');
  }

  // 4. Test Generation (first file)
  if (sampleFiles.length > 0) {
    console.log('═══════════════════════════════════════');
    console.log('🧪 TEST GENERATION');
    console.log('═══════════════════════════════════════\n');

    const generator = createTestGenerator();
    const firstFile = sampleFiles[0];

    try {
      const tests = await generator.generateTests(firstFile.content, firstFile.path);
      console.log(`File: ${path.basename(firstFile.path)}`);
      console.log(`Tests Generated: ${tests.tests.length}`);
      console.log(`Coverage Estimate: ${tests.coverageEstimate}%`);
      console.log('\nGenerated Tests:');
      tests.tests.forEach(t => {
        console.log(`  - ${t.type}: ${t.name}`);
      });
    } catch (e) {
      console.log('Could not generate tests for this file');
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('✅ TEST COMPLETE');
  console.log('═══════════════════════════════════════');
}

function findFiles(dir: string, extensions: string[], maxFiles = 50): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    console.log(`Directory not found: ${dir}`);
    return files;
  }

  function walk(currentDir: string) {
    if (files.length >= maxFiles) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      const fullPath = path.join(currentDir, entry.name);

      // Skip common directories
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', '.git', 'coverage', '__tests__'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

main().catch(console.error);

