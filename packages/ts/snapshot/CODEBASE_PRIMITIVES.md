---
snapshot_schema: "1.0"
package_name: "llm-sdk-github-copilot"
package_version: "0.1.0"
commit: "cbcdcf7"
generated_at: "2026-11-11"
extraction_method: "deterministic static analysis (no live runtime/network execution)"
---

# Codebase Architectural Primitives Snapshot: `llm-sdk-github-copilot`

## 1. Snapshot Metadata & Package Identity

- **Package / Service Name:** `llm-sdk-github-copilot`
- **Version:** `0.1.0`
- **Commit Baseline:** `cbcdcf7` (repo `multistageharness-com/RCM-llm-sdk`, path `github-copilot-sdk/v300`)
- **Module / Runtime System:** ESM (`"type": "module"`, `.mjs`), Node `>=20.6`
- **Primary Entry Point:** `src/index.mjs` (`main` and `exports["."]`)
- **Total Production Modules Analyzed:** `11` (`src/*.mjs`; `test/`, `examples/`, `.ai/` excluded)
- **Description (manifest):** Production harness around the GitHub Copilot SDK: chat, SSE streaming, structured I/O, tool calling, token budgets, session persistence, SRE observability (OpenTelemetry), events and hooks.
- **License:** MIT
- **Extraction:** `extract_primitives.py` AST/regex pass, then a manual static read of every `src/*.mjs` to fill the root barrel, `./runtime` re-exports, hook semantics, dynamic events and upstream primitives (recorded under `enrichment` in `primitives.json`).

## 2. Package Entry Points - Module & Export Surface

| Subpath / Module | Source File | Exported Symbols (`kind`) | In Root Barrel (`inRootBarrel`) |
| :--- | :--- | :--- | :--- |
| `.` *(root barrel)* | `src/index.mjs` | 44 re-exports: everything marked `true` in the rows below, plus from `src/harness.mjs`: `CopilotHarness` (class), `Harness` (class, alias of `CopilotHarness`), `EmptyPromptError` (class), `assertUserMessage` (fn), `createHarness` (fn), `extractContent` (fn), `formatSSE` (fn), `renderContextPreamble` (fn), `resolveAnswerContent` (fn) | `true` |
| `./cli-path` | `src/cli-path.mjs` | `DEFAULT_CANDIDATES` (const), `findClosestModuleDir` (fn), `findCopilot` (fn), `resolveCliPath` (fn), `resolveModuleEntry` (fn) | `true` |
| `./cli-path` | `src/cli-path.mjs` | `packageRootFromEntry` (fn), `readManifestEntry` (fn) | `false` |
| `./config` | `src/config.mjs` | `ConfigError` (class), `REASONING_EFFORTS` (const), `THINKING_TYPES` (const), `configFromEnv` (fn), `defaultConfig` (fn), `loadConfig` (fn), `loadConfigFile` (fn), `mergeConfig` (fn), `resolveSystemPrompt` (fn), `validateConfig` (fn) | `true` |
| `./hooks` | `src/hooks.mjs` | `HOOK_NAMES` (const), `HookManager` (class) | `true` |
| `./observability` | `src/observability.mjs` | `Observability` (class), `loadOtelApi` (fn), `telemetryConfigFor` (fn) | `true` |
| `./observability` | `src/observability.mjs` | `_setOtelApiForTests` (fn, test seam), `genAiAttributes` (fn) | `false` |
| `./runtime` | `src/runtime.mjs` | `resolveExecutablePath` (fn); re-exports from `./cli-path.mjs`: `packageRootFromEntry` (fn), `readManifestEntry` (fn) | `false` |
| `./runtime` | `src/runtime.mjs` | re-exports from `./cli-path.mjs`: `DEFAULT_CANDIDATES` (const), `findClosestModuleDir` (fn), `resolveModuleEntry` (fn) | `true` |
| `./store` | `src/store.mjs` | `ContextStore` (class) | `true` |
| `./structured` | `src/structured.mjs` | `StructuredOutputError` (class), `buildRepairPrompt` (fn), `buildStructuredPrompt` (fn), `extractJson` (fn), `parseStructuredResponse` (fn), `renderStructuredInput` (fn), `validateSchema` (fn) | `true` |
| `./tokens` | `src/tokens.mjs` | `TokenBudget` (class), `TokenBudgetExceededError` (class), `analyzeRun` (fn), `analyzeRunAccurate` (fn), `estimateMessagesTokens` (fn), `estimateTokens` (fn) | `true` |
| `./usage` | `src/usage.mjs` | `UsageTracker` (class) | `true` |
| *(no subpath)* | `src/harness.mjs` | `normalizeToolName` (fn) | `false` (module-exported but unreachable through the package `exports` map) |

## 3. Core Orchestration Primitives & Framing Functions

- **`CopilotHarness`** (`src/harness.mjs`, root barrel; alias `Harness`): `extends EventEmitter` (`node:events`). Composes config, hooks, token budget, usage tracker, optional context store and observability around a lazily imported `@github/copilot-sdk` `CopilotClient`. Owns CLI path / proxy wiring, session create/resume/replay, tool registration with hook interception, preflight budget gating, chat, streaming, and structured output with auto-repair.
- **`async createHarness(options = {}, deps = {})` -> `Promise<CopilotHarness>`:** Constructs `new CopilotHarness(options, deps)` and awaits `start()`.
- **Framing Functions:**
  - `formatSSE({ event, data, id } = {})` -> `string`: one SSE frame (`id:`, `event:`, one `data:` line per payload line, terminated by `\n\n`); non-string `data` is `JSON.stringify`'d (`null` when absent).
  - `renderContextPreamble(messages = [])` -> `string`: `''` when empty; otherwise a `<conversation-context>` block with `ROLE: content` lines and a trailing blank line.
  - `extractContent(content = [])` -> `{ text, thinking: string[], toolUses: object[] }`: splits phased Copilot messages and Messages-API-style blocks (`text` / `thinking` / `tool_use`).
  - `resolveAnswerContent(messages = [], fallback)` -> `string`: last non-`thinking` message with content, then the last message, then `fallback.content`, then `''`.
  - `assertUserMessage(message, method = 'chat')` -> `void`: throws `EmptyPromptError(method)` for a non-string or whitespace-only message.
  - `normalizeToolName(name)` -> `string`: strips `mcp__<server>__` (not reachable from the package exports).
  - Structured prompt framing (`src/structured.mjs`): `renderStructuredInput`, `buildStructuredPrompt`, `buildRepairPrompt` (see Section 11).

## 4. Orchestrator Constructor & Composed Properties

- **Constructor Signature:** `new CopilotHarness(options = {}, deps = {})`
  - `options`: `{ configFile?: string, config?: object /* overrides */, hooks?: Record<HookName, Function | Function[]> }`
  - `deps` (test seams): `{ sdk?: module, clientFactory?: (clientOptions) => Promise<Client>, env?: ProcessEnv }`
  - Calls `loadConfig({ configFile, overrides: options.config, env: deps.env ?? process.env })`; throws `ConfigError` on invalid config.

| Property | Type | Accessor | Role in Composed State |
| :--- | :--- | :--- | :--- |
| `_agentSpan` | `Span \| null` | Instance field (internal) | Root `invoke_agent` span while a run is in flight |
| `_client` | `CopilotClient \| null` | Instance field (internal) | Upstream client, set by `start()` |
| `_deps` | `object` | Instance field (internal) | Injected test seams |
| `_pendingContext` | `Array<{role, content}>` | Instance field (internal) | Messages from `attachContext()`, consumed by the next prompt |
| `_run` | `{ messages: PhasedMessage[], reasoning: string[] } \| null` | Instance field (internal) | Per-run assistant message / reasoning collector |
| `_sdk` | `module \| null` | Instance field (internal) | Lazily imported `@github/copilot-sdk` |
| `_session` | `CopilotSession \| null` | Instance field (internal) | Current upstream session |
| `_started` | `boolean` | Instance field (internal) | `start()` idempotency flag |
| `_toolVerdicts` | `Map<toolCallId, Verdict>` | Instance field (internal) | Per-run `beforeToolCall` verdict cache |
| `_tools` | `ToolDefinition[]` | Instance field (internal) | Tools from `registerTool()` |
| `budget` | `TokenBudget` | Instance field (`composedState`) | Built from `config.tokenBudget` |
| `client` | `CopilotClient \| null` | Getter (`getter: true`) | Returns `_client` |
| `config` | `HarnessConfig` | Instance field (`composedState`) | Validated, merged config |
| `hooks` | `HookManager` | Instance field (`composedState`) | Built from `options.hooks` |
| `obs` | `Observability` | Instance field (`composedState`) | Built from `config.observability` |
| `sessionId` | `string \| null` | Getter (`getter: true`) | `_session?.sessionId ?? null` |
| `store` | `ContextStore \| null` | Instance field (`composedState`) | Present only when `config.contextStore.enabled` |
| `usage` | `UsageTracker` | Instance field (`composedState`) | Aggregates SDK session events |

## 5. Lifecycle, Session & Execution Methods

**Process Lifecycle**
- **`async start()` -> `this`:** Idempotent. Awaits `obs.init()`; resolves the CLI path with `resolveCliPath({ required: false })`; builds the child env (`process.env` + `config.env`, plus `HTTPS_PROXY`/`HTTP_PROXY` = `config.httpProxy` scoped to the child only); sets `workingDirectory`, `baseDirectory`, `logLevel` and `gitHubToken` when configured, plus `telemetry` (from `telemetryConfigFor`) and `onGetTraceContext` (from `obs.traceContextProvider()`). Uses `deps.clientFactory` when given; otherwise imports the SDK, adds `connection = RuntimeConnection.forStdio({ path?, args? })` when a CLI path or `cliArgs` is set, and constructs `new CopilotClient(clientOptions)`. Emits `started { cliPath }`.
- **`async stop()` -> `Error[]`:** Disconnects the session, then calls `client.stop()` (collecting returned or thrown errors); clears session, client and `_started`. Emits `stopped { errors }`. Never throws.
- **`_loadSdk()`** *(internal, async)*: `import('@github/copilot-sdk')`, cached.

**Session / State Management**
- **`async createSession(opts = {})` -> `CopilotSession`:** `start()`, disconnects any current session (errors swallowed), `client.createSession(_buildSessionConfig(opts))`. Emits `session:created { sessionId }`.
- **`async resumeSession(sessionId, opts = {})` -> `CopilotSession`:** Same as above, using `client.resumeSession(sessionId, cfg)`. Emits `session:resumed { sessionId }`.
- **`async continueFrom(sessionId, opts = {})` -> `CopilotSession`:** Tries `resumeSession`. If that fails, replays `store.asContextMessages(sessionId)` through `attachContext` + `createSession` and emits `session:replayed { from, sessionId, messages }`. Throws `Error` when no store is configured or no stored context exists.
- **`attachContext(messages = [])` -> `this`:** Queues prior `{role, content}` messages for the next prompt.
- **`_buildSessionConfig(opts)`** *(internal)*: `{ ...config.sessionDefaults, model, reasoningEffort, streaming, workingDirectory?, hooks: _sdkHooksBridge(), onEvent, ...opts.sessionConfig }`, plus `systemMessage { mode: 'append'|'replace', content }` and wrapped `tools`.
- **`_sdkHooksBridge()`** *(internal)*: maps the SDK hooks onto harness hooks (Section 10).
- **`_onSessionEvent(event)`** *(internal)*: re-emits `event`, `delta`, `message`, `idle`; collects messages and reasoning into `_run`; feeds `usage.ingestEvent` → `obs.ingest` → `usage:<kind>`; on `tokens` records the spend in the budget and fires `budget:warn` / `budget:exceeded` plus the matching hooks.
- **`_ensureSession(opts)`**, **`_toolVerdictOnce(payload)`**, **`_isHarnessTool(name)`**, **`_wrapTool(tool)`** *(internal helpers)*.

**Execution & Reporting**
- **`registerTool({ name, description?, parameters?, handler, skipPermission? })` -> `this`:** Throws `TypeError` without `name` and `handler`. Tools are wrapped at session build time (`skipPermission` defaults to `true`). The wrapped handler: `beforeToolCall` verdict (cached per `toolCallId`) → when denied, returns `{ textResultForLlm, resultType: 'denied' }`; otherwise emits `tool:start` and `tool:call`, runs inside `obs.toolSpan`, emits `tool:result` and runs `afterToolCall`. On a thrown error it emits `tool:error`, runs `onToolFailure`, and returns `{ textResultForLlm, resultType: 'failure', error }`.
- **`preflight(prompt, opts = {})` -> `RunAnalysis`:** `analyzeRun` over the prompt, system prompt, pending + `opts.context`, `opts.attachments` and `opts.expectedOutputTokens`, against `budget`. Sends nothing.
- **`async chat(prompt, opts = {})` -> `ChatResult`:** `assertUserMessage` → root `invoke_agent` span → `_ensureSession` → compose context preamble → `preflight` → **`beforeRun` hook (can abort)** → `_gateOnBudget` (emits `preflight`; when over budget in `block` mode runs `onBudgetExceeded`, records error `harness/budget_blocked`, emits `budget:exceeded` and throws `TokenBudgetExceededError`; in `warn` mode emits `budget:warn`) → `run:start` → `chat {model}` span around `session.sendAndWait({ prompt, attachments? }, opts.timeout ?? requestTimeoutMs)` → resolves the answer and reasoning → `store?.saveExchange` → `afterRun` → `run:end`. On error: records `harness/chat_failed`, runs `onError { phase: 'chat' }`, emits `error:run` and rethrows.
- **`async *stream(prompt, opts = {})` -> `AsyncGenerator<StreamChunk>`:** Ensures a streaming session, subscribes to `session.on('assistant.message_delta')`, drives `chat()` in the background and yields `{ type: 'delta', content }`… then a single `{ type: 'message', content, usage, sessionId }`. Rethrows run errors. Unsubscribes and awaits the chat promise in `finally`.
- **`async structured(task, schema, opts = {})` -> `StructuredResult`:** `buildStructuredPrompt` → up to `1 + structured.maxRepairAttempts` calls to `chat()`, each followed by `parseStructuredResponse`. Emits `structured:ok { attempts }` or `structured:invalid { attempt, errors }` and re-asks with `buildRepairPrompt`. Throws `StructuredOutputError { errors, attempts }` once attempts run out. Usage is summed across attempts.
- **`usageSummary()` -> `UsageSummary & { budget: BudgetSnapshot }`**
- **`usageReport()` -> `string`:** `UsageTracker.report()` plus a budget line when `maxTokens` is set.
- **`_withAgentSpan(fn)`**, **`_chat`**, **`_structured`**, **`_composePrompt`**, **`_gateOnBudget`** *(internal)*.

## 6. Configuration Primitives

Precedence (lowest → highest), implemented by `loadConfig`:

1. `defaultConfig(env)`: built-in defaults (`model` and `reasoningEffort` already read `COPILOT_CLI_MODEL` / `COPILOT_CLI_REASON_EFFORT`)
2. `loadConfigFile(configFile)`: JSON file (`{}` when no path is given)
3. `configFromEnv(env)`: environment layer (`LLM_SDK_*` read first; `COPILOT_*` overwrite them when both are set)
4. `overrides`: programmatic (`options.config`)
5. Post-merge: when `httpProxy` is falsy and `proxyFromEnv` is true, `httpProxy = COPILOT_CLI_PROXY ?? HTTPS_PROXY ?? HTTP_PROXY ?? null`; then `validateConfig`

Merge semantics (`mergeConfig`): plain objects merge recursively; arrays and scalars replace; `undefined` values are skipped; every value is `structuredClone`d.

- `defaultConfig(env = process.env)` -> `HarnessConfig`
- `loadConfigFile(file)` -> `object` (throws `Error` when the file is unreadable or not valid JSON)
- `mergeConfig(base, ...layers)` -> `object`
- `configFromEnv(env = process.env)` -> `Partial<HarnessConfig>`
- `validateConfig(config)` -> `config` (throws `ConfigError` listing every problem)
- `loadConfig({ configFile?, overrides?, env? } = {})` -> `HarnessConfig`
- `resolveSystemPrompt(config)` -> `string | null` (`systemPrompt`, else reads `systemPromptFile`)
- `resolveCliPath({ cliPath?, fromDir?, env?, required = true } = {})` -> `string | null`. CLI precedence: `cliPath` → `COPILOT_CLI_PATH` → native `@github/copilot` resolution from `[fromDir, module dir, cwd]` → `node_modules` walk. Throws when the path is invalid, or when `required` is true and nothing is found.
- `resolveExecutablePath({ config = {}, env, fromDir, required = true } = {})` -> `string | null` (`config.cliPath ?? config.pathToClaudeCodeExecutable`)
- `telemetryConfigFor(obsConfig)` -> `TelemetryConfig | undefined`

## 7. Configuration Schema & Environment Variable Mapping

| Config Path | Type | Default Value | Mapped Environment Variable(s) |
| :--- | :--- | :--- | :--- |
| `agentName` | `string` | *(not defaulted; read for span name, falls back to `'harness'`)* | - |
| `baseDirectory` | `string \| null` | `null` | - |
| `cliArgs` | `string[]` | `[]` | - |
| `cliPath` | `string \| null` | `null` | `COPILOT_CLI_PATH` (env layer; also consulted directly by `resolveCliPath`) |
| `contextStore.directory` | `string` | `".copilot-harness/context"` | `LLM_SDK_STORE_DIR`, `COPILOT_HARNESS_STORE_DIR` (wins); either also sets `enabled: true` |
| `contextStore.enabled` | `boolean` | `false` | (set by the two variables above) |
| `env` | `Record<string,string>` | `{}` | - |
| `githubToken` | `string \| null` | `null` | - |
| `httpProxy` | `string \| null` | `null` | `COPILOT_CLI_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY` (post-merge fallback when `proxyFromEnv`) |
| `logLevel` | `string \| null` | `null` | - |
| `maxTokens` *(top-level)* | `number` | *(not defaulted)* | `LLM_SDK_MAX_TOKENS` (set by the env layer, not read by the harness) |
| `model` | `string` | `"gpt-5-mini"` | `COPILOT_CLI_MODEL` (default), `LLM_SDK_MODEL` (env layer), `COPILOT_MODEL` (env layer, wins) |
| `observability.captureContent` | `boolean` | `false` | - |
| `observability.enabled` | `boolean` | `false` | - |
| `observability.exporterType` | `'otlp-http' \| 'file' \| null` | `null` | - |
| `observability.filePath` | `string \| null` | `null` | - |
| `observability.otlpEndpoint` | `string \| null` | `null` | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `observability.providerName` | `string` | *(not defaulted; `'github.copilot'`)* | - |
| `observability.serviceName` | `string` | `"copilot-sdk-harness"` | - |
| `observability.sourceName` | `string` | *(not defaulted; falls back to `serviceName`)* | - |
| `pathToClaudeCodeExecutable` | `string` | *(not defaulted; alias read only by `resolveExecutablePath`)* | - |
| `proxyFromEnv` | `boolean` | `true` | - |
| `reasoningEffort` | `'low'\|'medium'\|'high'\|'xhigh'\|'max'` | `"low"` | `COPILOT_CLI_REASON_EFFORT` (default), `LLM_SDK_REASONING_EFFORT` (env layer), `COPILOT_REASONING_EFFORT` (env layer, wins) |
| `requestTimeoutMs` | `number` | `120000` | - |
| `sessionDefaults` | `object` | `{}` | - |
| `streaming` | `boolean` | `false` | - |
| `structured.maxRepairAttempts` | `number` | `2` | - |
| `systemPrompt` | `string \| null` | `null` | - |
| `systemPromptFile` | `string \| null` | `null` | `LLM_SDK_SYSTEM_PROMPT_FILE`, `COPILOT_SYSTEM_PROMPT_FILE` (wins) |
| `systemPromptMode` | `'append' \| 'replace'` | `"append"` | - |
| `tokenBudget.enforcement` | `'block' \| 'warn'` | `"block"` | - |
| `tokenBudget.maxTokens` | `number \| null` | `null` | `LLM_SDK_TOKEN_BUDGET`, `COPILOT_TOKEN_BUDGET` (wins) |
| `tokenBudget.warnAtPercent` | `number` (0–100) | `80` | - |
| `workingDirectory` | `string \| null` | `null` | - |

Validation rules (`validateConfig`): `reasoningEffort ∈ REASONING_EFFORTS`; `model` must be a string; `tokenBudget.maxTokens` must be a finite number > 0; `warnAtPercent` must be 0–100; `enforcement ∈ {block, warn}`; `systemPromptMode ∈ {append, replace}`; `systemPromptFile` must exist on disk.

## 8. Primitive Taxonomy

| Domain Layer | Module | Classes | Functions | Constants | Errors |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Core Orchestration** | `harness` | `CopilotHarness` (`Harness`) | `assertUserMessage`, `createHarness`, `extractContent`, `formatSSE`, `normalizeToolName`, `renderContextPreamble`, `resolveAnswerContent` | - | `EmptyPromptError` |
| **Configuration** | `config` | - | `configFromEnv`, `defaultConfig`, `loadConfig`, `loadConfigFile`, `mergeConfig`, `resolveSystemPrompt`, `validateConfig` | `REASONING_EFFORTS`, `THINKING_TYPES` | `ConfigError` |
| **Runtime Resolution** | `cli-path` | - | `findClosestModuleDir`, `findCopilot`, `packageRootFromEntry`, `readManifestEntry`, `resolveCliPath`, `resolveModuleEntry` | `DEFAULT_CANDIDATES`, `NOT_RESOLVABLE` (internal) | - |
| **Runtime Resolution** | `runtime` | - | `resolveExecutablePath` (+ re-exports) | (re-export) `DEFAULT_CANDIDATES` | - |
| **Hooks** | `hooks` | `HookManager` | - | `HOOK_NAMES` | - |
| **Observability** | `observability` | `Observability` | `_setOtelApiForTests`, `genAiAttributes`, `loadOtelApi`, `telemetryConfigFor` | `NOOP_SPAN` (internal) | - |
| **Persistence** | `store` | `ContextStore` | `sanitizeId` (internal) | - | - |
| **Structured I/O** | `structured` | - | `buildRepairPrompt`, `buildStructuredPrompt`, `extractJson`, `parseStructuredResponse`, `renderStructuredInput`, `validateSchema` | - | `StructuredOutputError` |
| **Token Budget** | `tokens` | `TokenBudget` | `analyzeRun`, `analyzeRunAccurate`, `estimateMessagesTokens`, `estimateTokens` | `CHARS_PER_TOKEN = 4` (internal) | `TokenBudgetExceededError` |
| **Usage Telemetry** | `usage` | `UsageTracker` | - | - | - |

## 9. Upstream Consumed Packages & Primitives

- **Required Dependencies:**
  - `@github/copilot-sdk` (`^1.0.28`), imported lazily with `await import(...)` in `CopilotHarness._loadSdk()`:
    - *Client & Session Primitives:* `CopilotClient` (constructor options `env`, `workingDirectory`, `baseDirectory`, `logLevel`, `gitHubToken`, `telemetry`, `onGetTraceContext`, `connection`), `RuntimeConnection.forStdio({ path?, args? })`, `client.createSession(cfg)`, `client.resumeSession(id, cfg)`, `client.stop()`, `session.sendAndWait({ prompt, attachments? }, timeoutMs)`, `session.on(eventType, fn)` (returns an unsubscribe function), `session.disconnect()`, `session.sessionId`. SessionConfig keys set: `model`, `reasoningEffort`, `streaming`, `workingDirectory`, `hooks`, `onEvent`, `systemMessage`, `tools`.
    - *Bridged Upstream Hooks:* `onErrorOccurred`, `onPostToolUse`, `onPostToolUseFailure`, `onPreToolUse` (returns `{ permissionDecision: 'deny', permissionDecisionReason }` to veto), `onSessionEnd`, `onSessionStart`, `onUserPromptSubmitted`
    - *Consumed Upstream Events:* `assistant.message`, `assistant.message_delta`, `assistant.reasoning`, `assistant.usage`, `model.call_failure`, `session.error`, `session.idle`, `session.usage_info`, `skill.invoked`, `tool.execution_complete`, `tool.execution_start`
  - Runtime binary (resolved, not imported): `@github/copilot` CLI; candidate list `@github/copilot`, `@github/copilot-sdk`, `@github/copilot-language-server`.
  - Node built-ins: `node:events`, `node:fs`, `node:module` (`createRequire`), `node:path`, `node:url` (`fileURLToPath`).
- **Optional / Peer Dependencies:**
  - `@opentelemetry/api` (`>=1.7.0`, optional; loaded with a dynamic import and replaced by no-ops when missing):
    - *API surface used:* `trace.getTracer`, `trace.setSpan`, `metrics.getMeter`, `context.active`, `context.with`, `propagation.inject`, `SpanKind`, `SpanStatusCode`
    - *Telemetry / Metrics Instruments:*
      - Counters: `copilot_harness.errors` (attr `kind`), `copilot_harness.requests`, `copilot_harness.tokens` (attr `direction`), `copilot_harness.tool.calls` (attrs `tool`, `outcome`)
      - Histograms: `copilot_harness.request.duration_ms`, `copilot_harness.request.ttft_ms`, `copilot_harness.tool.duration_ms` (all `ms`)
      - Observable gauges: `copilot_harness.budget.utilization`, `copilot_harness.context_window.utilization`
      - Spans (GenAI semconv): `invoke_agent {agentName}` (CLIENT), `chat {model}` (CLIENT), `execute_tool {toolName}` (INTERNAL); span event `gen_ai.client.inference.operation.details` (only when `captureContent` is on)

## 10. Events, EventEmitter & Lifecycle Hooks

**Emitted Events Surface** (`CopilotHarness extends EventEmitter`)
- **Static Events:** `budget:exceeded`, `budget:warn`, `delta`, `error:run`, `event`, `idle`, `message`, `preflight`, `run:end`, `run:start`, `session:created`, `session:replayed`, `session:resumed`, `started`, `stopped`, `structured:invalid`, `structured:ok`, `tool:call`, `tool:denied`, `tool:error`, `tool:result`, `tool:start`
- **Dynamic / Namespaced Events:** `usage:${record.kind}`, where `kind ∈ { context, provider:error, session:error, skill, tokens, tool:end, tool:start }`, giving `usage:context`, `usage:provider:error`, `usage:session:error`, `usage:skill`, `usage:tokens`, `usage:tool:end`, `usage:tool:start`

**Lifecycle Hooks Semantics** (`HookManager.run`: handlers are awaited in registration order. A handler error is collected as `{ hookError }` when the hook name starts with `on` or `after`; otherwise it propagates)

| Hook Name | `canVeto` | `errorSemantics` | Upstream Mapping / Trigger Point |
| :--- | :--- | :--- | :--- |
| `afterRun` | `false` | `swallowed` | End of `_chat`, after `saveExchange` and before `run:end` |
| `afterToolCall` | `false` | `swallowed` | Wrapped harness tool success; SDK `onPostToolUse` for non-harness (built-in/MCP) tools |
| `beforeRun` | `true` (throw) | `propagates` | `_chat`, after preflight and before the budget gate |
| `beforeToolCall` | `true` (`{ deny, reason }`; throw also aborts) | `propagates` | Wrapped harness tool handler; SDK `onPreToolUse` for non-harness tools. First deny wins (`toolCallVerdict`); cached per `toolCallId` per run |
| `onBudgetExceeded` | `false` | `swallowed` | `_gateOnBudget` in block mode (awaited); `_onSessionEvent` on the `exceeded` transition (fire-and-forget, `.catch`) |
| `onBudgetWarning` | `false` | `swallowed` | `_onSessionEvent` on the `warn` transition (fire-and-forget) |
| `onError` | `false` | `swallowed` | `_chat` catch (`phase: 'chat'`); SDK `onErrorOccurred` (`phase = errorContext`) |
| `onPromptSubmit` | `false` | `swallowed` | SDK `onUserPromptSubmitted` |
| `onSessionEnd` | `false` | `swallowed` | SDK `onSessionEnd` |
| `onSessionStart` | `false` | `swallowed` | SDK `onSessionStart` |
| `onToolFailure` | `false` | `swallowed` | Wrapped harness tool throw; SDK `onPostToolUseFailure` for non-harness tools |

`HookManager.register` throws `Error` for an unknown hook name and `TypeError` for a non-function handler.

## 11. Building Block Classes & Pure Functions

**Building Block Classes**
- **`HookManager` (`src/hooks.mjs`)**
  - *Constructor:* `new HookManager(initial = {})` (`initial`: `{ [hookName]: fn | fn[] }`)
  - *State:* `_hooks: Map<HookName, Function[]>`
  - *Methods:* `register(name, fn)` -> `() => void` (unsubscribe), `count(name)` -> `number`, `async run(name, payload)` -> `unknown[]`, `async toolCallVerdict(payload)` -> `{ deny: boolean, reason?: string }`
- **`TokenBudget` (`src/tokens.mjs`)**
  - *Constructor:* `new TokenBudget({ maxTokens = null, warnAtPercent = 80, enforcement = 'block' } = {})`
  - *Fields:* `maxTokens`, `warnAtPercent`, `enforcement`, `used`, `_warned`
  - *Getters:* `remaining` (`Infinity` when unlimited), `utilizationPercent` (capped at 100)
  - *Methods:* `record(tokens)` -> `'ok' | 'warn' | 'exceeded'` (`warn` fires once), `wouldExceed(estimate)` -> `boolean`, `checkOrThrow(estimate, context = {})` -> `boolean` (throws in block mode), `snapshot()` -> `BudgetSnapshot`
- **`UsageTracker` (`src/usage.mjs`)**
  - *Constructor:* `new UsageTracker()` → `reset()`
  - *Fields:* `tokens`, `apiCalls`, `cost`, `models: Map`, `tools: Map`, `skills: Map`, `errors`, `latency { ttftMs[], callDurationMs[] }`, `contextWindow`, `_openToolCalls: Map`
  - *Methods:* `reset()`, `ingestEvent(event)` -> `UsageRecord | null`, `summary()` -> `UsageSummary`, `report()` -> `string`, `static _stats(values)` -> `LatencyStats | null` (count/avg/p50/p95/max), `_model(name)`, `_tool(name)`
- **`ContextStore` (`src/store.mjs`)**
  - *Constructor:* `new ContextStore({ directory })` (throws without `directory`; the path is resolved to absolute)
  - *Layout:* `<dir>/<sanitizedId>.jsonl` (append-only exchanges), `<dir>/<sanitizedId>.meta.json`
  - *Methods:* `saveExchange(sessionId, { request, response, usage?, meta? })` -> `ExchangeRecord`, `load(sessionId)` -> `ExchangeRecord[]`, `meta(sessionId)` -> `SessionMeta | null`, `list()` -> `SessionMeta[]` (most recently updated first), `latestSessionId()` -> `string | null`, `asContextMessages(sessionId)` -> `ContextMessage[]`, `remove(sessionId)` -> `void`
- **`Observability` (`src/observability.mjs`)**
  - *Constructor:* `new Observability(obsConfig = {}, deps = {})` (`deps.api`, `deps.providerName`)
  - *Getters:* `providerName` (`config.providerName ?? 'github.copilot'`), `captureContent`
  - *Methods:* `async init()` -> `this`, `traceContextProvider()` -> `(() => carrier) | undefined`, `startSpan(name, attributes, { kind })` -> `Span`, `async withSpan(name, attributes, fn, opts)`, `invokeAgentSpan(info, fn)`, `chatSpan(info, fn)`, `toolSpan(info, fn)`, `startInvokeAgentSpan(info)`, `startChatSpan(info)`, `startToolSpan(info)`, `endSpan(span, error?)`, `setGenAiUsage(span, usage, { responseModel, ttftMs })`, `recordContent(span, { input, output })`, `recordRequestStart(attrs)`, `recordRequestEnd({ durationMs, ttftMs, model })`, `recordTokens({...})`, `recordToolCall({ tool, outcome, durationMs })`, `recordError(kind, attrs)`, `observeBudget(snapshot)`, `observeContextWindow(usageInfo)`, `ingest(record, rawEvent)`; internal `_invokeAgentSpec`, `_chatSpec`, `_toolSpec`

**Pure Transformation, Estimation & Validation Functions**
- `config`: `mergeConfig(base, ...layers) -> object`, `configFromEnv(env) -> object`, `defaultConfig(env) -> HarnessConfig`
- `harness`: `assertUserMessage(message, method) -> void`, `extractContent(content) -> ExtractedContent`, `formatSSE({ event, data, id }) -> string`, `normalizeToolName(name) -> string`, `renderContextPreamble(messages) -> string`, `resolveAnswerContent(messages, fallback) -> string`
- `observability`: `genAiAttributes(attrs) -> object` (drops `null`/`undefined`/`''`), `telemetryConfigFor(obsConfig) -> TelemetryConfig | undefined`
- `structured`: `buildRepairPrompt({ errors, schema }) -> string`, `buildStructuredPrompt({ task, input, schema, label }) -> string`, `extractJson(text) -> { value } | { error }` (fenced block → whole string → first balanced `{…}`/`[…]`), `parseStructuredResponse(text, schema) -> { ok: true, value } | { ok: false, errors }`, `renderStructuredInput(input, label = 'input') -> string`, `validateSchema(value, schema, pathPrefix = '$') -> { valid, errors }` (draft-07 subset: `type`, `properties`, `required`, `items`, `enum`, `const`, `additionalProperties: false`, `minItems`/`maxItems`, `minLength`/`maxLength`, `pattern`, `minimum`/`maximum`; integers satisfy `number`)
- `tokens`: `estimateTokens(text) -> number` (`max(ceil(len/4), ceil(words*4/3))`), `estimateMessagesTokens(messages) -> number` (+4 per message), `analyzeRun(input, budget?) -> RunAnalysis`, `analyzeRunAccurate(clientOrInput, inputOrBudget?, maybeBudget?) -> RunAnalysis` (synchronous; ignores a client that has `messages.countTokens`)

**Filesystem / Resolution / Runtime I/O Helpers**
- `cli-path`: `findClosestModuleDir(moduleName, { fromDir }) -> string | null`, `findCopilot({ candidates?, fromDir?, strategy?: 'auto'|'native'|'manual' }) -> CopilotLocation | null`, `packageRootFromEntry(moduleName, entry, { fromDir }) -> string | null`, `readManifestEntry(dir) -> string | null` (main → module → bin → index.js), `resolveCliPath(opts) -> string | null`, `resolveModuleEntry(moduleName, { fromDir }) -> string | null` (returns `null` for `MODULE_NOT_FOUND`, `ERR_MODULE_NOT_FOUND`, `ERR_PACKAGE_PATH_NOT_EXPORTED`, `ERR_UNSUPPORTED_DIR_IMPORT`; rethrows other errors)
- `config`: `loadConfigFile(file) -> object`, `loadConfig(opts) -> HarnessConfig`, `resolveSystemPrompt(config) -> string | null`, `validateConfig(config)` (checks `fs.existsSync`)
- `observability`: `async loadOtelApi() -> OtelApi | null` (cached in module state), `_setOtelApiForTests(api) -> void`
- `runtime`: `resolveExecutablePath({ config, env, fromDir, required }) -> string | null`

## 12. Error Types, Exceptions & Exported Constants

**Custom Error Classes**
1. **`ConfigError` (`./config` / `src/config.mjs`):** `extends Error`, `name = 'ConfigError'`, `inRootBarrel: true`. Thrown by `validateConfig` (and so by `loadConfig` and the `CopilotHarness` constructor) with every validation problem listed.
2. **`EmptyPromptError` (root only / `src/harness.mjs`):** `extends Error`, `name = 'EmptyPromptError'`, field `method`, `inRootBarrel: true`. Thrown by `assertUserMessage` at the start of `chat`, `stream` and `structured` for a non-string, empty or whitespace-only message.
3. **`StructuredOutputError` (`./structured` / `src/structured.mjs`):** `extends Error`, `name = 'StructuredOutputError'`, details assigned (`errors: string[]`, `attempts: number`), `inRootBarrel: true`. Thrown by `CopilotHarness.structured` once `1 + maxRepairAttempts` attempts fail.
4. **`TokenBudgetExceededError` (`./tokens` / `src/tokens.mjs`):** `extends Error`, `name = 'TokenBudgetExceededError'`, details assigned (`used`, `estimate`, `maxTokens`, ...context), `inRootBarrel: true`. Thrown by `TokenBudget.checkOrThrow` in `block` mode when `used + estimate > maxTokens` (the preflight gate in `chat`).

Plain `Error` / `TypeError` throws: `loadConfigFile` (unreadable or invalid JSON), `resolveCliPath` (invalid `cliPath`/`COPILOT_CLI_PATH`, or not found while `required`), `ContextStore` constructor (missing directory), `HookManager.register` (unknown name → `Error`, non-function → `TypeError`), `registerTool` (`TypeError`), `continueFrom` (resume failed and no store or stored context).

**Exported Constants**
- **`DEFAULT_CANDIDATES` (`./cli-path`, `./runtime`, root):** `['@github/copilot', '@github/copilot-sdk', '@github/copilot-language-server']`
- **`HOOK_NAMES` (`./hooks`, root):** `['beforeRun', 'afterRun', 'beforeToolCall', 'afterToolCall', 'onToolFailure', 'onPromptSubmit', 'onSessionStart', 'onSessionEnd', 'onError', 'onBudgetWarning', 'onBudgetExceeded']`
- **`REASONING_EFFORTS` (`./config`, root):** `['low', 'medium', 'high', 'xhigh', 'max']`
- **`THINKING_TYPES` (`./config`, root):** `['adaptive', 'disabled']` (inert in this harness; exported for parity with the sibling harnesses)

## 13. All Primitive Data Shapes (Interior & Public Schemas)

```typescript
// ---------- 1. Configuration ----------
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
type HookName =
  | 'beforeRun' | 'afterRun' | 'beforeToolCall' | 'afterToolCall' | 'onToolFailure'
  | 'onPromptSubmit' | 'onSessionStart' | 'onSessionEnd' | 'onError'
  | 'onBudgetWarning' | 'onBudgetExceeded';

interface TokenBudgetConfig {
  maxTokens: number | null;            // null = unlimited
  warnAtPercent: number;               // 0-100, default 80
  enforcement: 'block' | 'warn';       // default 'block'
}

interface ContextStoreConfig { enabled: boolean; directory: string; }

interface ObservabilityConfig {
  enabled: boolean;
  serviceName: string;                 // default 'copilot-sdk-harness'
  otlpEndpoint: string | null;
  exporterType: 'otlp-http' | 'file' | null;
  filePath: string | null;
  captureContent: boolean;
  providerName?: string;               // read, not defaulted
  sourceName?: string;                 // read, not defaulted
}

interface HarnessConfig {
  cliPath: string | null;
  cliArgs: string[];
  httpProxy: string | null;
  proxyFromEnv: boolean;
  env: Record<string, string>;
  workingDirectory: string | null;
  baseDirectory: string | null;
  logLevel: string | null;
  githubToken: string | null;
  model: string;
  reasoningEffort: ReasoningEffort;
  streaming: boolean;
  requestTimeoutMs: number;
  systemPrompt: string | null;
  systemPromptFile: string | null;
  systemPromptMode: 'append' | 'replace';
  tokenBudget: TokenBudgetConfig;
  contextStore: ContextStoreConfig;
  observability: ObservabilityConfig;
  structured: { maxRepairAttempts: number };
  sessionDefaults: Record<string, unknown>;
  agentName?: string;                  // read, not defaulted
  maxTokens?: number;                  // set by LLM_SDK_MAX_TOKENS only
  pathToClaudeCodeExecutable?: string; // alias read by resolveExecutablePath
}

interface LoadConfigOptions { configFile?: string; overrides?: Partial<HarnessConfig>; env?: NodeJS.ProcessEnv; }

interface HarnessOptions {
  configFile?: string;
  config?: Partial<HarnessConfig>;
  hooks?: Partial<Record<HookName, Function | Function[]>>;
}
interface HarnessDeps {
  sdk?: unknown;                                         // opaque: @github/copilot-sdk module
  clientFactory?: (opts: ClientOptions & { cliPath: string | null; cliArgs: string[] }) => Promise<unknown>;
  env?: NodeJS.ProcessEnv;
}

// Passed to CopilotClient (opaque upstream contract; keys as set by start())
interface ClientOptions {
  env: Record<string, string>;
  workingDirectory?: string;
  baseDirectory?: string;
  logLevel?: string;
  gitHubToken?: string;
  telemetry?: TelemetryConfig;
  onGetTraceContext?: () => Record<string, string>;
  connection?: unknown;                                  // opaque: RuntimeConnection.forStdio(...)
}

interface TelemetryConfig {                              // SDK TelemetryConfig subset produced by telemetryConfigFor
  otlpEndpoint?: string;
  exporterType?: 'otlp-http' | 'file';
  filePath?: string;
  sourceName?: string;
  captureContent?: boolean;
}

// ---------- 2. Discovery / resolution ----------
interface ResolveCliPathOptions { cliPath?: string; fromDir?: string; env?: NodeJS.ProcessEnv; required?: boolean; }
interface ResolveExecutablePathOptions { config?: Partial<HarnessConfig>; env?: NodeJS.ProcessEnv; fromDir?: string; required?: boolean; }
interface FindCopilotOptions { candidates?: string | string[]; fromDir?: string; strategy?: 'auto' | 'native' | 'manual'; }
interface CopilotLocation {
  name: string;
  dir: string | null;
  entry: string | null;
  strategy: 'native' | 'manual';
  fromDir: string;
}

// ---------- 3. Execution, streaming, tools ----------
interface ContextMessage { role: 'user' | 'assistant' | string; content: string; }

interface ChatOptions {
  context?: ContextMessage[];
  attachments?: string[];              // file contents, preflight estimation only
  attachmentRefs?: unknown[];          // forwarded as sendAndWait attachments (opaque)
  expectedOutputTokens?: number;
  timeout?: number;
  systemPrompt?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  streaming?: boolean;
  workingDirectory?: string;
  sessionConfig?: Record<string, unknown>;
}

interface RunUsage { inputTokens: number; outputTokens: number; totalTokens: number; durationMs: number; }

interface ChatResult {
  content: string;
  reasoning: string | null;
  thinking: { text: string; steps: string[] } | null;
  sessionId: string | null;
  usage: RunUsage;
  response: unknown;                   // opaque: raw sendAndWait result
}

type StreamChunk =
  | { type: 'delta'; content: string }
  | { type: 'message'; content: string; usage: RunUsage; sessionId: string | null };
// internal queue item only (rethrown, never yielded): { type: 'error'; error: unknown }

interface StructuredOptions extends ChatOptions { input?: unknown; inputLabel?: string; }
interface StructuredResult {
  value: unknown;
  content: string;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: object;                 // JSON Schema
  handler: (args: unknown, invocation?: { sessionId?: string; toolCallId?: string }) => unknown;
  skipPermission?: boolean;            // wrapped default: true
}
type WrappedToolFailure =
  | { textResultForLlm: string; resultType: 'denied' }
  | { textResultForLlm: string; resultType: 'failure'; error: string };

interface SSEFrameInput { event?: string; data?: unknown; id?: string | number; }

interface PhasedMessage { content: string; phase?: 'thinking' | 'response' | string; reasoningText?: string; }
interface ExtractedContent { text: string; thinking: string[]; toolUses: object[]; }

// ---------- 4. Validation / structured output ----------
interface SchemaValidationResult { valid: boolean; errors: string[]; }
type ExtractJsonResult = { value: unknown } | { error: string };
type ParseStructuredResult = { ok: true; value: unknown } | { ok: false; errors: string[] };
interface BuildStructuredPromptInput { task: string; input?: unknown; schema: object; label?: string; }
interface BuildRepairPromptInput { errors: string[]; schema: object; }

// ---------- 5. Hook payloads & verdicts ----------
interface ToolHookBase {
  toolName: string;
  bareToolName: string;
  args: unknown;
  sessionId?: string;
  toolUseId?: string;
}
interface HookPayloads {
  beforeRun: { prompt: string; sessionId: string | null; analysis: RunAnalysis };
  afterRun: { prompt: string; response: string; usage: RunUsage; sessionId: string | null };
  beforeToolCall: ToolHookBase;
  afterToolCall: ToolHookBase & { result: unknown; durationMs?: number };
  onToolFailure: ToolHookBase & { error: unknown };
  onPromptSubmit: { prompt: string; sessionId: string };
  onSessionStart: { sessionId: string };
  onSessionEnd: { sessionId: string; reason?: unknown };
  onError: { error: unknown; phase: string; sessionId: string | null };
  onBudgetWarning: { budget: BudgetSnapshot };
  onBudgetExceeded: { budget: BudgetSnapshot; estimate?: number };
}
interface BeforeToolCallReturn { deny?: boolean; reason?: string; }
interface ToolCallVerdict { deny: boolean; reason?: string; }
interface ObserveOnlyHookErrorEntry { hookError: unknown; }  // collected in run() results
interface SdkPreToolUseDeny { permissionDecision: 'deny'; permissionDecisionReason: string; }

// ---------- 6. Interior state records ----------
interface BudgetSnapshot {
  maxTokens: number | null;
  used: number;
  remaining: number | null;
  utilizationPercent: number;          // 1 decimal place
  enforcement: 'block' | 'warn';
}

interface RunAnalysisInput {
  prompt: string;
  systemPrompt?: string | null;
  context?: ContextMessage[];
  attachments?: string[];
  expectedOutputTokens?: number;
}
interface RunAnalysis {
  breakdown: {
    promptTokens: number; systemTokens: number; contextTokens: number;
    attachmentTokens: number; expectedOutputTokens: number;
  };
  estimatedInputTokens: number;
  estimatedTotalTokens: number;
  budget: BudgetSnapshot | null;
  fitsWithinBudget: boolean;
  recommendation: string;              // 'ok' | blocked/over-budget guidance text
}

// UsageTracker.ingestEvent normalized records (also the `usage:<kind>` event payloads)
type UsageRecord =
  | { kind: 'tokens'; inputTokens: number; outputTokens: number; model?: string }
  | ({ kind: 'context' } & Record<string, unknown>)           // spread of session.usage_info data
  | { kind: 'tool:start'; tool: string; toolCallId?: string }
  | { kind: 'tool:end'; tool: string; toolCallId?: string; success: boolean; durationMs: number; error: unknown | null }
  | { kind: 'skill'; skill: string }
  | { kind: 'provider:error'; status: number | null; message: string }
  | { kind: 'session:error'; message?: string };

interface LatencyStats { count: number; avg: number; p50: number; p95: number; max: number; }
interface ModelUsage { calls: number; inputTokens: number; outputTokens: number; totalDurationMs: number; }
interface ToolUsage { calls: number; succeeded: number; failed: number; totalDurationMs: number; }
interface OpenToolCall { name: string; startedAt: number; }    // _openToolCalls value
interface UsageSummary {
  tokens: { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; total: number };
  apiCalls: number;
  cost: number | null;
  models: Record<string, ModelUsage>;
  tools: Record<string, ToolUsage & { avgDurationMs: number }>;
  skills: Record<string, number>;
  errors: { providerFailures: number; rateLimited: number; sessionErrors: number };
  latency: { ttftMs: LatencyStats | null; callDurationMs: LatencyStats | null };
  contextWindow: { currentTokens?: number; tokenLimit?: number; messagesLength?: number; [k: string]: unknown } | null;
}
type HarnessUsageSummary = UsageSummary & { budget: BudgetSnapshot };

// ContextStore on-disk records
interface ExchangeRecord {
  timestamp: string;                   // ISO-8601
  request: { prompt: string } | null;
  response: { content: string } | null;
  usage: RunUsage | null;
  meta: { model?: string; [k: string]: unknown } | null;
}
interface SessionMeta {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  exchanges: number;
  model?: string;
}

// Per-run collector (CopilotHarness._run)
interface RunCollector { messages: PhasedMessage[]; reasoning: string[]; }

// Telemetry attributes
interface GenAiSpanAttributes {
  'gen_ai.operation.name': 'invoke_agent' | 'chat' | 'execute_tool';
  'gen_ai.provider.name'?: string;
  'gen_ai.agent.name'?: string;
  'gen_ai.conversation.id'?: string;
  'gen_ai.request.model'?: string;
  'gen_ai.tool.name'?: string;
  'gen_ai.tool.call.id'?: string;
  'gen_ai.tool.type'?: string;         // default 'custom'
  'gen_ai.response.model'?: string;
  'gen_ai.usage.input_tokens'?: number;
  'gen_ai.usage.output_tokens'?: number;
  'gen_ai.usage.reasoning.output_tokens'?: number;
  'gen_ai.response.time_to_first_chunk'?: number;   // seconds
}
interface ContentCaptureEventAttributes {           // event 'gen_ai.client.inference.operation.details'
  'gen_ai.input.messages'?: string;                 // JSON
  'gen_ai.output.messages'?: string;                // JSON
}
interface MetricAttributes {
  model?: string;
  direction?: 'input' | 'output' | 'reasoning' | 'cache_read' | 'cache_write';
  kind?: 'provider' | 'rate_limit' | 'session' | 'harness';
  tool?: string;
  outcome?: 'success' | 'failure' | 'denied';
  status?: number | 'unknown';
  reason?: 'budget_blocked' | 'chat_failed';
}

// ---------- Opaque external contracts (not resolved here) ----------
// CopilotClient, CopilotSession, RuntimeConnection, SessionConfig, sendAndWait response,
// raw SDK session events ({ type, data, id, timestamp }), and the @opentelemetry/api
// Tracer / Meter / Span / Context types are defined by the upstream packages.
```
