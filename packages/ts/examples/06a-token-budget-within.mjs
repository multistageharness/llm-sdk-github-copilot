// 06a — Token budget: a request that fits WITHIN budget.
//
// A token budget is a ceiling on how many tokens the harness will spend.
// Before each run, harness.preflight() estimates the cost; if it fits, the
// run proceeds and actual usage is tracked against the ceiling.
//
// Here the budget is generous (50,000 tokens), so a short prompt fits easily.
// Compare with 06b-token-budget-exceeded.mjs, which uses a tiny budget.
//
// Run: node examples/06a-token-budget-within.mjs [--cli-path ...]

import { createHarness } from '../src/index.mjs';
import { parseCommonArgs, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const harness = await createHarness({
  config: baseConfig(args, {
    // Plenty of room — a short prompt + reply is nowhere near 50k tokens.
    tokenBudget: { maxTokens: 50_000, warnAtPercent: 80, enforcement: 'block' },
  }),
});

harness.on('budget:warn', (b) => console.error(`[budget] warning at ${b.utilizationPercent}%`));

await runExample(harness, async () => {
  const prompt = 'Summarize the SRE golden signals in 3 bullets.';

  // 1. Estimate the cost BEFORE spending anything.
  const analysis = harness.preflight(prompt, { expectedOutputTokens: 150 });
  console.log(`estimated ~${analysis.estimatedTotalTokens} tokens, ` +
    `fits budget: ${analysis.fitsWithinBudget}\n`);

  // 2. It fits, so run it. This succeeds.
  const { content } = await harness.chat(prompt);
  console.log(content);

  // 3. See how much of the budget the run actually used.
  console.log(`\n${harness.usageReport()}`);
});
