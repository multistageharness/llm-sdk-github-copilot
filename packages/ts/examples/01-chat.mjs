// 01 — Basic chat with config-driven model + reasoning effort.
//
// Run:
//   node examples/01-chat.mjs [--cli-path /path/to/copilot] [--proxy http://****:*****@proxy:8080]
//   node examples/01-chat.mjs --model gpt-5-mini --effort low "Why is the sky blue?"

import { createHarness } from "../src/index.mjs";
import { parseCommonArgs, baseConfig, runExample } from "./_shared.mjs";

const args = parseCommonArgs();
const harness = await createHarness({ config: baseConfig(args) });

await runExample(harness, async () => {
  const prompt =
    args._[0] ?? "In one sentence: what does a token budget protect against?";
  const { content, usage, sessionId } = await harness.chat(prompt);
  console.log(content);
  console.log(
    `\n[session ${sessionId}] ${usage.totalTokens} tokens in ${usage.durationMs}ms`,
  );
});
