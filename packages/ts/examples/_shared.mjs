/**
 * Shared CLI argument parsing for the examples.
 *
 * Every example accepts:
 *   --cli-path <path>   explicit Copilot CLI entry (CLI_PATH); falls back to
 *                       COPILOT_CLI_PATH, then module resolution of @github/copilot
 *   --proxy <url>       optional HTTP(S) proxy, scoped to the CLI child process
 *   --model <id>        model id (default gpt-5-mini)
 *   --effort <level>    reasoning effort: low|medium|high|xhigh (default low)
 */

export function parseCommonArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--cli-path': args.cliPath = argv[++i]; break;
      case '--proxy': args.httpProxy = argv[++i]; break;
      case '--model': args.model = argv[++i]; break;
      case '--effort': args.reasoningEffort = argv[++i]; break;
      default: args._.push(argv[i]);
    }
  }
  return args;
}

/** Harness config overrides shared by all examples. */
export function baseConfig(args, extra = {}) {
  return {
    model: args.model ?? 'gpt-5-mini',
    reasoningEffort: args.reasoningEffort ?? 'low',
    ...(args.cliPath && { cliPath: args.cliPath }),
    ...(args.httpProxy && { httpProxy: args.httpProxy }),
    // Keep examples on the bare SDK surface.
    cliArgs: ['--disable-builtin-mcps'],
    ...extra,
  };
}

/** try/finally + signal-safe runner so client.stop() always executes. */
export async function runExample(harness, fn) {
  const shutdown = async (code) => {
    try {
      await harness.stop();
    } catch (err) {
      console.error('harness.stop() failed:', err);
    }
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));
  try {
    await fn();
  } catch (err) {
    console.error(err);
    await shutdown(1);
  }
  await shutdown(0);
}
