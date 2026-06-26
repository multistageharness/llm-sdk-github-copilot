// 02 — Streaming chat: deltas printed as they arrive.
//
// The harness exposes streaming as an async iterator; under the hood it
// subscribes to the SDK's `assistant.message_delta` events (the CLI's SSE
// stream surfaced as typed events).
//
// Run: node examples/02-streaming.mjs [--cli-path ...] [--proxy ...]

import { createHarness } from '../src/index.mjs';
import { parseCommonArgs, baseConfig, runExample } from './_shared.mjs';

const args = parseCommonArgs();
const harness = await createHarness({ config: baseConfig(args, { streaming: true }) });

await runExample(harness, async () => {
  const prompt = args._[0] ?? 'Write a haiku about garbage collection in JavaScript.';
  for await (const item of harness.stream(prompt)) {
    if (item.type === 'delta') {
      process.stdout.write(item.content);
    } else if (item.type === 'message') {
      process.stdout.write(`\n\n[done] ${item.usage.totalTokens} tokens\n`);
    }
  }
});
