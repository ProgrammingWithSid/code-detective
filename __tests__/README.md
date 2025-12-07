# Test Suite

This directory contains comprehensive test cases for Code Sherlock.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

- `git.test.ts` - Tests for Git operations (checkout, diff parsing, changed files detection)
- `config.test.ts` - Tests for configuration loading and validation
- `chunker.test.ts` - Tests for code chunking using chunkyyy
- `ai-provider.test.ts` - Tests for AI providers (OpenAI and Claude)
- `reviewer.test.ts` - Tests for the main PR reviewer orchestration
- `pr-comments.test.ts` - Tests for PR comment posting (GitHub and GitLab)

## Test Coverage

The test suite covers:

- ✅ Git branch checkout and diff parsing
- ✅ Changed line detection from git diffs
- ✅ Configuration loading from file and environment variables
- ✅ Code chunking with chunkyyy integration
- ✅ AI provider abstraction (OpenAI and Claude)
- ✅ Comment filtering to only changed lines
- ✅ PR comment posting (GitHub and GitLab)
- ✅ Error handling and edge cases

## Mocking

Tests use Jest mocks for:
- External dependencies (chunkyyy, OpenAI, Claude, simple-git, Octokit)
- File system operations
- Network requests (fetch for GitLab)

## Writing New Tests

When adding new features:

1. Create a test file in `__tests__/` directory
2. Follow the naming convention: `*.test.ts`
3. Mock external dependencies
4. Test both success and error cases
5. Test edge cases and boundary conditions
