import { ConfigLoader, PRReviewer, ReviewResult } from '../src/index';

async function main(): Promise<void> {
  // Load configuration
  const config = ConfigLoader.load('code-sherlock.config.json');
  ConfigLoader.validate(config);

  // Create reviewer instance
  const reviewer = new PRReviewer(config);

  // Review a specific file range
  console.log('Reviewing file range...');
  const result: ReviewResult = await reviewer.reviewFile(
    'src/utils.ts',
    'feature-branch',
    10, // start line
    50 // end line
  );

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
