// 04 — Structured input + structured output against a JSON Schema.
//
// The harness embeds the schema in the prompt, extracts JSON from the
// reply, validates it locally, and auto-repairs (re-asks with the
// validation errors) up to `structured.maxRepairAttempts` times.
//
// Run: node examples/04-structured-output.mjs [--cli-path ...]

import { createHarness } from '../src/index.mjs';
import { parseCommonArgs, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const harness = await createHarness({ config: baseConfig(args) });

const SCHEMA = {
  type: 'object',
  required: ['language', 'complexity', 'summary', 'risks'],
  additionalProperties: false,
  properties: {
    language: { type: 'string' },
    complexity: { enum: ['low', 'medium', 'high'] },
    summary: { type: 'string', maxLength: 280 },
    risks: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
};

await runExample(harness, async () => {
  const { value, attempts, usage } = await harness.structured(
    'Analyze this code snippet.',
    SCHEMA,
    {
      input: {
        filename: 'cache.mjs',
        code: 'const cache = {}; export const get = (k) => cache[k]; export const put = (k, v) => { cache[k] = v; };',
      },
      inputLabel: 'code-snippet',
    },
  );
  console.log(JSON.stringify(value, null, 2));
  console.log(`\n[${attempts} attempt(s), ${usage.totalTokens} tokens]`);
});
