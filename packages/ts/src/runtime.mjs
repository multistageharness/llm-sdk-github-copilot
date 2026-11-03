/**
 * Runtime wiring shim — the canonical `./runtime` subpath for the Copilot
 * harness (interchange contract §3).
 *
 * The Copilot runtime is the `@github/copilot` CLI; its location logic lives in
 * `cli-path.mjs` (this package's `./cli-path` extra subpath). This module
 * re-exports those helpers under the canonical runtime names shared with the
 * sibling harnesses, so `import('llm-sdk-github-copilot/runtime')` is
 * swap-compatible with `llm-sdk-claude-agent/runtime`.
 */

import { resolveCliPath } from './cli-path.mjs';

export {
  resolveModuleEntry,
  findClosestModuleDir,
  readManifestEntry,
  packageRootFromEntry,
  DEFAULT_CANDIDATES,
} from './cli-path.mjs';

/**
 * Resolve the runtime executable under the canonical signature used by
 * `claude-agent-sdk/src/runtime.mjs`. Deltas from that sibling (documented):
 * the explicit-path config key here is `cliPath` (the agent sibling's
 * `pathToClaudeCodeExecutable` is also honored as an alias), and the env var
 * consulted is `COPILOT_CLI_PATH` (inside `resolveCliPath`).
 *
 * @param {object} [opts]
 * @param {object} [opts.config] harness config ({ cliPath } here)
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {string} [opts.fromDir] anchor for module resolution
 * @param {boolean} [opts.required] throw when nothing resolves (default true)
 * @returns {string|null}
 */
export function resolveExecutablePath({ config = {}, env = process.env, fromDir, required = true } = {}) {
  return resolveCliPath({
    cliPath: config.cliPath ?? config.pathToClaudeCodeExecutable ?? null,
    env,
    fromDir,
    required,
  });
}
