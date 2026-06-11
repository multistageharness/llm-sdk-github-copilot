# Examples

Every example accepts the common flags:

| Flag | Meaning |
| --- | --- |
| `--cli-path <path>` | Explicit Copilot CLI entry (`CLI_PATH`). Falls back to `COPILOT_CLI_PATH`, then module resolution of `@github/copilot`, then the SDK's bundled runtime. |
| `--proxy <url>` | Optional `HTTP_PROXY` / `HTTPS_PROXY`, scoped to the spawned CLI process only (never `process.env`). |
| `--model <id>` | Model id (default `gpt-5-mini`). |
| `--effort <level>` | Reasoning effort `low\|medium\|high\|xhigh` (default `low`). |

Prerequisites: the Copilot CLI must be authenticated (`gh auth status` or
`COPILOT_GITHUB_TOKEN`), and your account needs Copilot access.

| # | File | Shows |
| --- | --- | --- |
| 01 | `01-chat.mjs` | Basic chat, model + reasoning-effort config |
| 02 | `02-streaming.mjs` | Async-iterator streaming of message deltas |
| 03 | `03-sse-server.mjs` | HTTP server relaying deltas as Server-Sent Events + `/usage` endpoint |
| 04 | `04-structured-output.mjs` | Structured input + JSON-Schema-validated output with auto-repair |
| 05 | `05-tool-calling.mjs` | Custom tools — the model calls your code (weather + add) |
| 06 | `06-token-budget.mjs` | Pre-run token analysis, budget block, usage report |
| 06a | `06a-token-budget-within.mjs` | A request that fits **within** budget — preflight, run, usage |
| 06b | `06b-token-budget-exceeded.mjs` | A request that goes **over** budget — blocked before sending |
| 07 | `07-session-persistence.mjs` | Context store on disk, `--continue` to resume/replay a conversation |
| 08 | `08-observability.mjs` | OTel golden signals + CLI-side trace file exporter |
| 09 | `09-hooks-and-events.mjs` | Full hook + event lifecycle, policy veto |
