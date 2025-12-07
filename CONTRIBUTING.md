# Contributing to Code Sherlock

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Project Structure

```
src/
├── types.ts          # TypeScript type definitions
├── config.ts         # Configuration loading and validation
├── git.ts            # Git operations (checkout, diff, etc.)
├── chunker.ts        # Integration with chunkyyy for code chunking
├── ai-provider.ts    # AI provider abstraction (OpenAI/Claude)
├── pr-comments.ts    # PR comment posting (GitHub/GitLab)
├── reviewer.ts       # Main PR reviewer orchestration
├── cli.ts            # CLI interface
└── index.ts          # Public API exports
```

## Key Components

### PRReviewer
The main service that orchestrates the review process:
1. Checks out the target branch
2. Detects changed files
3. Chunks code using chunkyyy
4. Reviews code with AI
5. Posts comments to PR

### ChunkService
Integrates with chunkyyy to:
- Chunk changed files
- Extract code ranges
- Map chunkyyy chunks to our format

### AI Providers
Supports multiple AI providers:
- OpenAI (GPT-4, GPT-3.5)
- Claude (Claude 3.5 Sonnet)

## Testing

```bash
npm test
```

## Building

```bash
npm run build
```

## Notes on chunkyyy Integration

The `ChunkService` uses chunkyyy's `chunkFile()` method. If chunkyyy provides a range-based method (e.g., `chunkFileByRange()`), you can update the `chunker.ts` file to use it directly instead of manually extracting ranges.
