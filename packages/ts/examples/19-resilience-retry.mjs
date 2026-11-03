// 19 — Resilience: retry with exponential backoff + model fallback.
//
// Production callers must survive transient model.call_failure / rate-limit
// errors. This wraps chat() in a retry loop with exponential backoff; after the
// primary model exhausts its retries it switches to a fallback model id (via a
// fresh session) and reports which model ultimately answered.
//
// Run:
//   node examples/19-resilience-retry.mjs [--cli-path ...] [--model <id>] [--token-budget <n>] ["prompt"]
//   node examples/19-resilience-retry.mjs --model gpt-5-mini --effort low "Summarize the SRE golden signals in 3 bullets."

import { createHarness } from './_shared.mjs';
import { parseCommonArgs, baseConfig, runExample, requirePrompt } from './_shared.mjs';

const args = parseCommonArgs();
// No prompt => print usage and exit before starting the runtime (0 tokens).
const prompt = requirePrompt(args, 'node examples/19-resilience-retry.mjs "Summarize the SRE golden signals in 3 bullets."');
const harness = await createHarness({ config: baseConfig(args) });

const PRIMARY_MODEL = harness.config.model;
// A second model id to fall back to. Copilot model ids are account-specific
// (`client.listModels()`); it must also accept the configured reasoning effort.
// Override with FALLBACK_MODEL for your account.
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || 'claude-sonnet-5';
const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry each model up to MAX_RETRIES with exponential backoff, then fall back.
async function chatResilient(message) {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError;
  for (let m = 0; m < models.length; m += 1) {
    const model = models[m];
    if (m > 0) console.error(`[fallback] primary exhausted — switching to model "${model}"`);
    // Switching model requires a fresh session (chat reuses the live one).
    // Creating it is part of the attempt: an unavailable model is retried too.
    let switched = m === 0;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        if (!switched) {
          await harness.createSession({ model });
          switched = true;
        }
        const result = await harness.chat(message);
        return { ...result, model, attempt };
      } catch (err) {
        lastError = err;
        console.error(`[retry] model="${model}" attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
        if (attempt === MAX_RETRIES) break;
        const delay = 250 * 2 ** (attempt - 1); // 250ms, 500ms, 1000ms, ...
        console.error(`[backoff] waiting ${delay}ms before retry`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`all models exhausted; last error: ${lastError?.message ?? lastError}`);
}

await runExample(harness, async () => {
  const { content, model, attempt } = await chatResilient(prompt);
  console.log(content);
  console.log(`\n[answered by model "${model}" on attempt ${attempt}]`);
});
