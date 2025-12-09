import { ConfigLoader, PRReviewer, ReviewResult } from '../src/index';

async function main(): Promise<void> {
  // Load configuration
  const config = ConfigLoader.load('code-sherlock.config.json');
  ConfigLoader.validate(config);

  // Create reviewer instance
  const reviewer = new PRReviewer(config);

  // Review a PR - reviews commits in the target branch
  console.log('Starting PR review...');
  const result: ReviewResult = await reviewer.reviewPR('feature-branch', true);

  // Display results
  console.log('\n=== Review Summary ===');
  console.log(result.summary);
  console.log(`\nErrors: ${result.stats.errors}`);
  console.log(`Warnings: ${result.stats.warnings}`);
  console.log(`Suggestions: ${result.stats.suggestions}`);

  // Display comments
  if (result.comments.length > 0) {
    console.log('\n=== Comments ===');
    result.comments.forEach((comment, index) => {
      console.log(`\n${index + 1}. ${comment.file}:${comment.line} [${comment.severity}]`);
      console.log(`   ${comment.body}`);
    });
  }
}

main().catch(console.error);
