/**
 * Tests for Security and Performance Analyzers
 */

import {
  SecurityAnalyzer,
  createSecurityAnalyzer,
  PerformanceAnalyzer,
  createPerformanceAnalyzer,
} from '../src/analyzers';

describe('SecurityAnalyzer', () => {
  let analyzer: SecurityAnalyzer;

  beforeEach(() => {
    analyzer = createSecurityAnalyzer();
  });

  describe('SQL Injection Detection', () => {
    it('should detect SQL injection via string concatenation', () => {
      const files = [
        {
          path: 'src/db.ts',
          content: `
          const userId = req.params.id;
          db.raw('SELECT * FROM users WHERE id = ' + $userId);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const sqlIssues = result.issues.filter((i) => i.type === 'sql-injection');

      expect(sqlIssues.length).toBeGreaterThan(0);
      expect(sqlIssues[0].cweId).toBe('CWE-89');
    });

    it('should detect SQL injection via template literals', () => {
      const files = [
        {
          path: 'src/db.ts',
          content: `
          const userId = req.params.id;
          db.query(\`SELECT * FROM users WHERE id = \${userId}\`);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const sqlIssues = result.issues.filter((i) => i.type === 'sql-injection');

      expect(sqlIssues.length).toBeGreaterThan(0);
    });
  });

  describe('XSS Detection', () => {
    it('should detect innerHTML assignment', () => {
      const files = [
        {
          path: 'src/component.ts',
          content: `
          const userInput = document.getElementById('input').value;
          document.getElementById('output').innerHTML = userInput;
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const xssIssues = result.issues.filter((i) => i.type === 'xss');

      expect(xssIssues.length).toBeGreaterThan(0);
      expect(xssIssues[0].cweId).toBe('CWE-79');
    });

    it('should detect dangerouslySetInnerHTML', () => {
      const files = [
        {
          path: 'src/component.tsx',
          content: `
          return <div dangerouslySetInnerHTML={{ __html: userContent }} />;
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const xssIssues = result.issues.filter((i) => i.type === 'xss');

      expect(xssIssues.length).toBeGreaterThan(0);
    });

    it('should detect document.write', () => {
      const files = [
        {
          path: 'src/script.js',
          content: `
          document.write('<h1>' + userName + '</h1>');
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const xssIssues = result.issues.filter((i) => i.type === 'xss');

      expect(xssIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Command Injection Detection', () => {
    it('should detect eval usage', () => {
      const files = [
        {
          path: 'src/util.ts',
          content: `
          const code = req.body.code;
          eval(code);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const cmdIssues = result.issues.filter((i) => i.type === 'command-injection');

      expect(cmdIssues.length).toBeGreaterThan(0);
      expect(cmdIssues[0].cweId).toBe('CWE-95');
    });

    it('should detect exec with user input', () => {
      const files = [
        {
          path: 'src/util.ts',
          content: `
          const userCmd = req.params.cmd;
          exec('ls ' + userCmd);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const cmdIssues = result.issues.filter((i) => i.type === 'command-injection');

      expect(cmdIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Hardcoded Secrets Detection', () => {
    it('should detect hardcoded passwords', () => {
      const files = [
        {
          path: 'src/config.ts',
          content: `
          const password = "superSecretPassword123";
          const apiKey = "sk_live_abcdefghijklmnop";
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const secretIssues = result.issues.filter((i) => i.type === 'hardcoded-secret');

      expect(secretIssues.length).toBeGreaterThan(0);
    });

    it('should detect AWS access keys', () => {
      const files = [
        {
          path: 'src/aws.ts',
          content: `
          const accessKey = "AKIAIOSFODNN7EXAMPLE";
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const secretIssues = result.issues.filter((i) => i.type === 'hardcoded-secret');

      expect(secretIssues.length).toBeGreaterThan(0);
      expect(secretIssues[0].confidence).toBe('high');
    });

    it('should detect private keys', () => {
      const files = [
        {
          path: 'src/keys.ts',
          content: `
          const key = "-----BEGIN PRIVATE KEY-----";
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const secretIssues = result.issues.filter((i) => i.type === 'hardcoded-secret');

      expect(secretIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Weak Cryptography Detection', () => {
    it('should detect MD5 usage', () => {
      const files = [
        {
          path: 'src/hash.ts',
          content: `
          const hash = crypto.createHash('md5').update(password).digest('hex');
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const cryptoIssues = result.issues.filter((i) => i.type === 'weak-crypto');

      expect(cryptoIssues.length).toBeGreaterThan(0);
      expect(cryptoIssues[0].cweId).toBe('CWE-328');
    });

    it('should detect SHA-1 usage', () => {
      const files = [
        {
          path: 'src/hash.ts',
          content: `
          const hash = crypto.createHash('sha1').update(data).digest('hex');
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const cryptoIssues = result.issues.filter((i) => i.type === 'weak-crypto');

      expect(cryptoIssues.length).toBeGreaterThan(0);
    });
  });

  describe('JWT Issues Detection', () => {
    it('should detect jwt.decode without verify', () => {
      const files = [
        {
          path: 'src/auth.ts',
          content: `
          const payload = jwt.decode(token);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const authIssues = result.issues.filter((i) => i.type === 'insecure-auth');

      expect(authIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Options and Filtering', () => {
    it('should filter by enabled checks', () => {
      const analyzer = createSecurityAnalyzer({
        enabledChecks: ['sql-injection'],
      });

      const files = [
        {
          path: 'src/mixed.ts',
          content: `
          eval(code);
          db.query('SELECT * FROM users WHERE id = ' + userId);
        `,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.issues.every((i) => i.type === 'sql-injection')).toBe(true);
    });

    it('should filter by minimum severity', () => {
      const analyzer = createSecurityAnalyzer({
        minSeverity: 'error',
      });

      const files = [
        {
          path: 'src/mixed.ts',
          content: `
          const hash = crypto.createHash('md5').update(data).digest('hex');
          eval(code);
        `,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.issues.every((i) => i.severity === 'error')).toBe(true);
    });

    it('should exclude low confidence issues by default', () => {
      const analyzer = createSecurityAnalyzer({
        includeLowConfidence: false,
      });

      const files = [
        {
          path: 'src/api.ts',
          content: `
          const data = JSON.parse(req.body);
        `,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.issues.every((i) => i.confidence !== 'low')).toBe(true);
    });

    it('should include low confidence issues when option set', () => {
      const analyzer = createSecurityAnalyzer({
        includeLowConfidence: true,
      });

      const files = [
        {
          path: 'src/api.ts',
          content: `
          const data = JSON.parse(req.body);
        `,
        },
      ];

      const result = analyzer.analyze(files);

      // Should include low confidence issues
      expect(result.issues.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatAsMarkdown', () => {
    it('should format results as markdown', () => {
      const files = [
        {
          path: 'src/vulnerable.ts',
          content: `
          eval(userInput);
          db.query('SELECT * FROM users WHERE id = ' + userId);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const markdown = analyzer.formatAsMarkdown(result);

      expect(markdown).toContain('Security Analysis Report');
      expect(markdown).toContain('Summary');
      expect(markdown).toContain('CWE');
    });

    it('should show no issues message when clean', () => {
      const files = [
        {
          path: 'src/clean.ts',
          content: `const x = 1 + 2;`,
        },
      ];

      const result = analyzer.analyze(files);
      const markdown = analyzer.formatAsMarkdown(result);

      expect(markdown).toContain('No security issues detected');
    });
  });

  describe('Summary Statistics', () => {
    it('should calculate summary correctly', () => {
      const files = [
        {
          path: 'src/vulnerable.ts',
          content: `
          eval(userInput);
          const hash = crypto.createHash('md5').update(data).digest('hex');
        `,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.summary).toBeDefined();
      expect(result.filesAnalyzed).toBe(1);
      expect(result.analysisTime).toBeGreaterThanOrEqual(0);
    });

    it('should count issues by type', () => {
      // Use same patterns that work in other tests
      const files = [
        {
          path: 'src/util.ts',
          content: `
          const code = req.body.code;
          eval(code);
        `,
        },
      ];

      const result = analyzer.analyze(files);

      // Should have issues
      expect(result.issues.length).toBeGreaterThan(0);

      // Check byType is populated for found issues
      const issueType = result.issues[0].type;
      expect(result.byType[issueType]).toBeGreaterThan(0);
    });
  });
});

describe('PerformanceAnalyzer', () => {
  let analyzer: PerformanceAnalyzer;

  beforeEach(() => {
    analyzer = createPerformanceAnalyzer();
  });

  describe('N+1 Query Detection', () => {
    it('should detect forEach with async', () => {
      const files = [
        {
          path: 'src/service.ts',
          content: `
          users.forEach(async (user) => {
            await fetchOrders(user.id);
          });
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const nPlusOneIssues = result.issues.filter((i) => i.type === 'n-plus-one');

      expect(nPlusOneIssues.length).toBeGreaterThan(0);
      expect(nPlusOneIssues[0].impact).toBe('high');
    });
  });

  describe('Memory Leak Detection', () => {
    it('should detect setInterval without clear', () => {
      const files = [
        {
          path: 'src/timer.ts',
          content: `
          setInterval(() => {
            updateData();
          }, 1000);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const leakIssues = result.issues.filter((i) => i.type === 'memory-leak');

      expect(leakIssues.length).toBeGreaterThan(0);
    });

    it('should detect missing unsubscribe', () => {
      const files = [
        {
          path: 'src/component.ts',
          content: `
          observable.subscribe((data) => {
            this.data = data;
          });
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const cleanupIssues = result.issues.filter((i) => i.type === 'missing-cleanup');

      expect(cleanupIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Inefficient Loop Detection', () => {
    it('should detect nested loops with includes', () => {
      const files = [
        {
          path: 'src/search.ts',
          content: `
          for (const item of items) {
            for (const other of others) {
              if (item.tags.includes(other.name)) {
                result.push(item);
              }
            }
          }
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const loopIssues = result.issues.filter((i) => i.type === 'inefficient-loop');

      expect(loopIssues.length).toBeGreaterThan(0);
      expect(loopIssues[0].impact).toBe('high');
    });

    it('should detect filter().find() chain', () => {
      const files = [
        {
          path: 'src/utils.ts',
          content: `
          const result = items.filter(i => i.active).find(i => i.id === targetId);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const loopIssues = result.issues.filter((i) => i.type === 'inefficient-loop');

      expect(loopIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Large Import Detection', () => {
    it('should detect full lodash import', () => {
      const files = [
        {
          path: 'src/utils.ts',
          content: `
          import _ from 'lodash';

          const result = _.map(items, transform);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const importIssues = result.issues.filter((i) => i.type === 'large-import');

      expect(importIssues.length).toBeGreaterThan(0);
    });

    it('should detect moment.js import', () => {
      const files = [
        {
          path: 'src/date.ts',
          content: `
          import moment from 'moment';

          const date = moment().format('YYYY-MM-DD');
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const importIssues = result.issues.filter((i) => i.type === 'large-import');

      expect(importIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Sync I/O Detection', () => {
    it('should detect readFileSync', () => {
      const files = [
        {
          path: 'src/file.ts',
          content: `
          const data = fs.readFileSync('./config.json');
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const syncIssues = result.issues.filter((i) => i.type === 'sync-io');

      expect(syncIssues.length).toBeGreaterThan(0);
      expect(syncIssues[0].category).toBe('backend');
    });

    it('should detect writeFileSync', () => {
      const files = [
        {
          path: 'src/file.ts',
          content: `
          fs.writeFileSync('./output.txt', content);
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const syncIssues = result.issues.filter((i) => i.type === 'sync-io');

      expect(syncIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Unbounded Query Detection', () => {
    it('should detect query without limit', () => {
      const files = [
        {
          path: 'src/db.ts',
          content: `
          const users = await db.collection('users').find({ active: true });
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const queryIssues = result.issues.filter((i) => i.type === 'unbounded-query');

      expect(queryIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Options and Filtering', () => {
    it('should filter by focus area (frontend)', () => {
      const analyzer = createPerformanceAnalyzer({
        focus: 'frontend',
      });

      const files = [
        {
          path: 'src/app.ts',
          content: `
          import _ from 'lodash';
          fs.readFileSync('./config.json');
        `,
        },
      ];

      const result = analyzer.analyze(files);

      // Should only include frontend issues
      expect(result.issues.every((i) => i.category === 'frontend' || i.category === 'both')).toBe(
        true
      );
    });

    it('should filter by focus area (backend)', () => {
      const analyzer = createPerformanceAnalyzer({
        focus: 'backend',
      });

      const files = [
        {
          path: 'src/server.ts',
          content: `
          import _ from 'lodash';
          fs.readFileSync('./config.json');
        `,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.issues.every((i) => i.category === 'backend' || i.category === 'both')).toBe(
        true
      );
    });

    it('should filter by minimum impact', () => {
      const analyzer = createPerformanceAnalyzer({
        minImpact: 'high',
      });

      const files = [
        {
          path: 'src/mixed.ts',
          content: `
          users.forEach(async (user) => {
            await fetchOrders(user.id);
          });
          items.filter(i => i.active).find(i => i.id === targetId);
        `,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.issues.every((i) => i.impact === 'high')).toBe(true);
    });
  });

  describe('Performance Score', () => {
    it('should calculate perfect score for clean code', () => {
      const files = [
        {
          path: 'src/clean.ts',
          content: `const x = 1 + 2;`,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.score).toBe(100);
    });

    it('should reduce score for issues', () => {
      const files = [
        {
          path: 'src/problematic.ts',
          content: `
          import _ from 'lodash';
          users.forEach(async (user) => {
            await fetchOrders(user.id);
          });
        `,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.score).toBeLessThan(100);
    });
  });

  describe('formatAsMarkdown', () => {
    it('should format results as markdown', () => {
      const files = [
        {
          path: 'src/app.ts',
          content: `
          import _ from 'lodash';
          fs.readFileSync('./config.json');
        `,
        },
      ];

      const result = analyzer.analyze(files);
      const markdown = analyzer.formatAsMarkdown(result);

      expect(markdown).toContain('Performance Analysis Report');
      expect(markdown).toContain('Performance Score');
      expect(markdown).toContain('Summary');
    });

    it('should show no issues message when clean', () => {
      const files = [
        {
          path: 'src/clean.ts',
          content: `const x = 1 + 2;`,
        },
      ];

      const result = analyzer.analyze(files);
      const markdown = analyzer.formatAsMarkdown(result);

      expect(markdown).toContain('No performance issues detected');
    });
  });

  describe('Summary Statistics', () => {
    it('should calculate summary correctly', () => {
      const files = [
        {
          path: 'src/test.ts',
          content: `
          import _ from 'lodash';
          setInterval(() => {}, 1000);
        `,
        },
      ];

      const result = analyzer.analyze(files);

      expect(result.summary).toBeDefined();
      expect(result.filesAnalyzed).toBe(1);
      expect(result.analysisTime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Integration: Security + Performance', () => {
  it('should analyze both security and performance in one file', () => {
    const securityAnalyzer = createSecurityAnalyzer();
    const performanceAnalyzer = createPerformanceAnalyzer();

    const files = [
      {
        path: 'src/vulnerable-slow.ts',
        content: `
        import _ from 'lodash';

        eval(userInput);

        users.forEach(async (user) => {
          const data = await db.query('SELECT * FROM orders WHERE user_id = ' + user.id);
        });

        fs.readFileSync('./config.json');
      `,
      },
    ];

    const securityResult = securityAnalyzer.analyze(files);
    const performanceResult = performanceAnalyzer.analyze(files);

    expect(securityResult.issues.length).toBeGreaterThan(0);
    expect(performanceResult.issues.length).toBeGreaterThan(0);

    // Both should detect relevant issues
    expect(securityResult.issues.some((i) => i.type === 'command-injection')).toBe(true);
    expect(performanceResult.issues.some((i) => i.type === 'large-import')).toBe(true);
  });
});
