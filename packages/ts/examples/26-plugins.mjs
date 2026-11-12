// 26 — Local directory plugin + scoped built-in tools + an external MCP server.
//
// Patterns (SPEC_PATTERN.md P-38):
//   A  built-in tool scoping  — `availableTools` allowlists read-only tools (least privilege), and
//                               `onPermissionRequest` approves only `read` (+ `mcp` with --mcp)
//   B  local directory plugin — `pluginDirectories` injects ./plugins/repo-auditor for this
//                               session only; the harness resolves it to an absolute path, so the
//                               runtime's own working directory does not break discovery
//   D  MCP server wrapping    — pass `--mcp "<command> [args…]"` to attach a stdio MCP server
//
// The names in `availableTools` are the runtime's built-in tool names (observed: `view`, `glob`,
// `rg`, `skill`); ask the agent to "list your tools and skills" to see what it actually loaded.
// With --mcp, the MCP server's tools are allowed too.
//
// DEMO-GRADE: needs a live, authenticated Copilot CLI to fully run. The
// no-prompt usage guard below exits before the runtime is ever spawned.
//
// Run:
//   node examples/26-plugins.mjs "List your tools and skills, then audit src/config.mjs."
//   node examples/26-plugins.mjs --mcp "npx -y @modelcontextprotocol/server-filesystem ." "List the repo files."

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './_shared.mjs';
import { parseCommonArgs, baseConfig, runExample, requirePrompt } from './_shared.mjs';

// Pull our one example-specific flag out before the common parser sees it.
const argv = process.argv.slice(2);
const mcpAt = argv.indexOf('--mcp');
const mcpCommand = mcpAt >= 0 ? argv.splice(mcpAt, 2)[1] : null;

const args = parseCommonArgs(argv);
// No prompt => print usage and exit before starting the runtime (0 tokens).
const prompt = requirePrompt(args, 'node examples/26-plugins.mjs [--mcp "<cmd> [args]"] "List your tools and skills, then audit src/config.mjs."');

const pluginDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugins', 'repo-auditor');
const [mcpBin, ...mcpArgs] = mcpCommand ? mcpCommand.split(/\s+/) : [];

const harness = await createHarness({
  config: baseConfig(args, {
    availableTools: ['view', 'glob', 'rg', 'skill', ...(mcpBin ? ['mcp:external'] : [])],
    pluginDirectories: [pluginDir],
    ...(mcpBin && { mcpServers: { external: { type: 'local', command: mcpBin, args: mcpArgs, tools: ['*'] } } }),
  }),
});

harness.on('tool:start', ({ tool }) => console.error(`[tool] ${tool}`));
harness.on('usage:skill', (r) => console.error(`[skill] ${r.skill}`));

// The harness sets no permission handler, so without one the runtime refuses even reads
// ("no one could approve"). Approve read (and MCP when attached); anything else gets no
// answer and is refused. A function can't live in config (it is structuredClone'd), so
// it goes on the per-call sessionConfig.
const onPermissionRequest = (request) => (
  request.kind === 'read' || (mcpBin && request.kind === 'mcp')
    ? { kind: 'approve-once' }
    : { kind: 'no-result' }
);

await runExample(harness, async () => {
  await harness.createSession({ sessionConfig: { onPermissionRequest } });
  const { content } = await harness.chat(prompt);
  console.log(content);
});
