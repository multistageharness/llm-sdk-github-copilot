// 06b — Token budget: a request that goes OVER budget.
//
// Same structure as 06a, but the budget is small (500 tokens) and the prompt
// is large — we ask the model to summarize a big document. The prompt alone
// estimates well past 500 tokens, so with enforcement 'block' the harness
// refuses to run and throws TokenBudgetExceededError — no tokens are spent.
//
// This is how you stop an oversized request before it reaches the model.
//
// Run: node examples/06b-token-budget-exceeded.mjs [--cli-path ...]

import { createHarness, TokenBudgetExceededError } from '../src/index.mjs';
import { parseCommonArgs, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const harness = await createHarness({
  config: baseConfig(args, {
    // Small ceiling. enforcement: 'block' => throw before sending.
    // ('warn' would let the run proceed and just fire a budget:exceeded event.)
    tokenBudget: { maxTokens: 500, warnAtPercent: 80, enforcement: 'block' },
  }),
});

harness.on('budget:exceeded', (b) => console.error(`[budget] EXCEEDED: ${b.used}/${b.maxTokens}`));

await runExample(harness, async () => {
  // A large document to summarize — far bigger than a 500-token budget allows.
  const bigDocument = 'The service emitted a 503 error during deploy. '.repeat(400);
  const prompt = `Summarize this incident log in 3 bullets:\n\n${bigDocument}`;

  // 1. Estimate the cost BEFORE spending anything.
  const analysis = harness.preflight(prompt, { expectedOutputTokens: 150 });
  console.log(`estimated ~${analysis.estimatedTotalTokens} tokens, ` +
    `fits budget: ${analysis.fitsWithinBudget}`);
  console.log(`recommendation: ${analysis.recommendation}\n`);

  // 2. It does NOT fit, so the run is blocked. Catch the budget error.
  try {
    await harness.chat(prompt);
    console.log('(unexpected) the run was allowed');
  } catch (err) {
    if (err instanceof TokenBudgetExceededError) {
      console.error(`blocked as expected: ${err.message}`);
    } else {
      throw err;
    }
  }
});
