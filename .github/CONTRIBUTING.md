# Contributing to Code-Sherlock

Thank you for your interest in contributing to Code-Sherlock! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/ProgrammingWithSid/code-sherlock.git
cd code-sherlock

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## 🔧 Development

### Project Structure

```
code-sherlock/
├── src/
│   ├── ai-provider/      # AI provider implementations
│   ├── analyzers/        # Security & performance analyzers
│   ├── autofix/          # Auto-fix generation
│   ├── cli/              # CLI commands
│   ├── context/          # Context engine
│   ├── conversation/     # @sherlock commands
│   ├── core/             # Core review logic
│   ├── feedback/         # Summary & diagram generation
│   ├── integrations/     # GitHub/GitLab integrations
│   ├── learning/         # Learning store
│   ├── orchestration/    # Multi-model orchestration
│   ├── pr-comments/      # PR comment services
│   ├── storage/          # Caching system
│   └── types/            # TypeScript types
├── __tests__/            # Test files
└── .github/              # GitHub Actions & templates
```

### Available Scripts

```bash
# Development
npm run dev           # Watch mode
npm run build         # Build TypeScript
npm run clean         # Clean dist folder

# Testing
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report

# Linting
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues
npm run format        # Format with Prettier
npm run format:check  # Check formatting

# Validation
npm run typecheck     # TypeScript check
npm run validate      # All checks
```

## 📝 Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Keep files under 200 lines
- Use descriptive variable names

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new security pattern for XXE detection
fix: correct line number calculation in diff parser
docs: update README with new CLI options
test: add tests for performance analyzer
refactor: simplify consensus merger logic
```

### Testing

- Write tests for all new features
- Maintain test coverage above 80%
- Use descriptive test names
- Group related tests with `describe`

```typescript
describe('SecurityAnalyzer', () => {
  describe('SQL Injection Detection', () => {
    it('should detect SQL injection via string concatenation', () => {
      // ...
    });
  });
});
```

## 🔒 Adding Security Patterns

To add a new security pattern:

1. Add the pattern to `src/analyzers/security-analyzer.ts`:

```typescript
{
  name: 'my-new-pattern',
  type: 'xss',
  pattern: /myPattern/g,
  languages: ['typescript', 'javascript'],
  severity: 'error',
  message: 'Description of the issue',
  cweId: 'CWE-XXX',
  confidence: 'high',
}
```

2. Add tests in `__tests__/analyzers.test.ts`
3. Update documentation if needed

## ⚡ Adding Performance Patterns

To add a new performance pattern:

1. Add the pattern to `src/analyzers/performance-analyzer.ts`:

```typescript
{
  name: 'my-new-pattern',
  type: 'inefficient-loop',
  pattern: /myPattern/g,
  languages: ['typescript', 'javascript'],
  severity: 'warning',
  impact: 'medium',
  message: 'Description of the issue',
  category: 'both',
}
```

2. Add tests in `__tests__/analyzers.test.ts`

## 🐛 Bug Reports

Please include:

1. Version of code-sherlock
2. Node.js version
3. Operating system
4. Steps to reproduce
5. Expected vs actual behavior
6. Error messages or logs

## 💡 Feature Requests

Please include:

1. Clear description of the feature
2. Use case / motivation
3. Example of how it would work
4. Any alternatives considered

## 📋 Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Ensure linting passes: `npm run lint`
7. Commit with conventional commit message
8. Push and create a Pull Request

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Changelog entry (if applicable)
- [ ] TypeScript types updated
- [ ] No linting errors
- [ ] PR title follows conventional commits

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙋 Questions?

Feel free to open an issue or reach out to the maintainers!
