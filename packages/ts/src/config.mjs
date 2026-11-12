/**
 * Harness configuration: defaults < config file < environment < overrides.
 *
 * Every knob the harness exposes lives here so callers have one place to
 * reason about precedence. `loadConfig()` is pure given its inputs (pass a
 * custom `env` for tests).
 */

import fs from 'node:fs';
import path from 'node:path';

// Canonical effort list shared across the sibling harnesses (interchange
// contract). 'max' is accepted for config parity; the Copilot runtime may
// clamp or reject it at request time on models that do not support it.
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Thinking modes accepted by the sibling Anthropic harnesses' `thinking`
 * config. Inert here (the Copilot runtime has no thinking knob) — exported for
 * interchange parity so a swapped config validates identically.
 */
export const THINKING_TYPES = ['adaptive', 'disabled'];

/**
 * @param {NodeJS.ProcessEnv} [env] environment consulted for default values
 * @returns {object} deep copy of the harness defaults
 */
export function defaultConfig(env = process.env) {
  return {
    // --- runtime / CLI wiring ---
    cliPath: null,            // explicit path to the @github/copilot CLI entry (CLI_PATH)
    cliArgs: [],              // extra args for the spawned runtime
    httpProxy: null,          // optional proxy URL, scoped to the child process env
    proxyFromEnv: true,       // pick up HTTP(S)_PROXY from env when httpProxy unset
    env: {},                  // extra env vars for the spawned runtime
    workingDirectory: null,
    baseDirectory: null,      // COPILOT_HOME for the runtime
    logLevel: null,           // runtime log level
    githubToken: null,

    // --- model behavior ---
    model: env.COPILOT_CLI_MODEL ?? 'gpt-5-mini',
    reasoningEffort: env.COPILOT_CLI_REASON_EFFORT ?? 'low',
    streaming: false,
    requestTimeoutMs: 120_000,

    // --- tools & extensions ---
    availableTools: null,     // tool allowlist → SessionConfig.availableTools (null = runtime default)
    excludedTools: null,      // tool denylist → SessionConfig.excludedTools (wins over availableTools)
    mcpServers: {},           // { name: MCPServerConfig } (local/stdio `command` · http/sse `url`)
    pluginDirectories: [],    // local plugin dirs, resolved absolute → SessionConfig.pluginDirectories
    skillDirectories: [],     // skill roots, resolved absolute → SessionConfig.skillDirectories
    disabledSkills: [],       // skill names to switch off → SessionConfig.disabledSkills
    builtinPluginDirectories: [], // host-trusted plugin dirs registered at client start

    // --- system prompt / instruction document ---
    systemPrompt: null,       // inline instruction text
    systemPromptFile: null,   // path to an instruction document (markdown/text)
    systemPromptMode: 'append', // 'append' | 'replace'

    // --- token budget ---
    tokenBudget: {
      maxTokens: null,        // total tokens (input+output) allowed across the harness lifetime
      warnAtPercent: 80,      // emit budget:warn at this utilization
      enforcement: 'block',   // 'block' (throw before run) | 'warn' (emit + continue)
    },

    // --- context window persistence ---
    contextStore: {
      enabled: false,
      directory: '.copilot-harness/context',
    },

    // --- SRE observability ---
    observability: {
      enabled: false,
      serviceName: 'copilot-sdk-harness',
      otlpEndpoint: null,     // OTLP HTTP endpoint (traces/metrics from the CLI runtime)
      exporterType: null,     // 'otlp-http' | 'file'
      filePath: null,         // JSONL trace output path when exporterType==='file'
      captureContent: false,  // capture prompts/responses in CLI telemetry
    },

    // --- structured output ---
    structured: {
      maxRepairAttempts: 2,   // re-ask the model this many times on invalid JSON
    },

    // passthrough merged into every SessionConfig (escape hatch)
    sessionDefaults: {},
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Recursive merge: plain objects merge, everything else replaces. */
export function mergeConfig(base, ...layers) {
  const out = structuredClone(base);
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      if (isPlainObject(value) && isPlainObject(out[key])) {
        out[key] = mergeConfig(out[key], value);
      } else {
        out[key] = structuredClone(value);
      }
    }
  }
  return out;
}

/** Map recognized environment variables onto a config layer. */
export function configFromEnv(env = process.env) {
  const layer = {};
  // Canonical cross-harness names (interchange contract §4) are read first so
  // the provider-prefixed names below keep precedence when both are set.
  if (env.LLM_SDK_MODEL) layer.model = env.LLM_SDK_MODEL;
  if (env.LLM_SDK_REASONING_EFFORT) layer.reasoningEffort = env.LLM_SDK_REASONING_EFFORT;
  if (env.LLM_SDK_MAX_TOKENS) layer.maxTokens = Number(env.LLM_SDK_MAX_TOKENS);
  if (env.LLM_SDK_SYSTEM_PROMPT_FILE) layer.systemPromptFile = env.LLM_SDK_SYSTEM_PROMPT_FILE;
  if (env.LLM_SDK_TOKEN_BUDGET) {
    layer.tokenBudget = { maxTokens: Number(env.LLM_SDK_TOKEN_BUDGET) };
  }
  if (env.LLM_SDK_STORE_DIR) {
    layer.contextStore = { enabled: true, directory: env.LLM_SDK_STORE_DIR };
  }
  if (env.COPILOT_CLI_PATH) layer.cliPath = env.COPILOT_CLI_PATH;
  if (env.COPILOT_MODEL) layer.model = env.COPILOT_MODEL;
  if (env.COPILOT_REASONING_EFFORT) layer.reasoningEffort = env.COPILOT_REASONING_EFFORT;
  if (env.COPILOT_SYSTEM_PROMPT_FILE) layer.systemPromptFile = env.COPILOT_SYSTEM_PROMPT_FILE;
  if (env.COPILOT_TOKEN_BUDGET) {
    layer.tokenBudget = { maxTokens: Number(env.COPILOT_TOKEN_BUDGET) };
  }
  if (env.COPILOT_HARNESS_STORE_DIR) {
    layer.contextStore = { enabled: true, directory: env.COPILOT_HARNESS_STORE_DIR };
  }
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    layer.observability = { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT };
  }
  return layer;
}

/** Read a JSON config file. Returns {} when `file` is falsy. */
export function loadConfigFile(file) {
  if (!file) return {};
  const abs = path.resolve(file);
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read harness config file ${abs}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in harness config file ${abs}: ${err.message}`);
  }
}

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Throw a ConfigError when a config value is out of range. */
export function validateConfig(config) {
  const problems = [];
  if (config.reasoningEffort && !REASONING_EFFORTS.includes(config.reasoningEffort)) {
    problems.push(
      `reasoningEffort must be one of ${REASONING_EFFORTS.join(', ')} (got "${config.reasoningEffort}")`,
    );
  }
  if (config.model != null && typeof config.model !== 'string') {
    problems.push('model must be a string');
  }
  const max = config.tokenBudget?.maxTokens;
  if (max != null && (!Number.isFinite(max) || max <= 0)) {
    problems.push(`tokenBudget.maxTokens must be a positive number (got ${max})`);
  }
  const warnAt = config.tokenBudget?.warnAtPercent;
  if (warnAt != null && (warnAt < 0 || warnAt > 100)) {
    problems.push(`tokenBudget.warnAtPercent must be 0-100 (got ${warnAt})`);
  }
  if (config.tokenBudget?.enforcement
      && !['block', 'warn'].includes(config.tokenBudget.enforcement)) {
    problems.push("tokenBudget.enforcement must be 'block' or 'warn'");
  }
  if (!['append', 'replace'].includes(config.systemPromptMode)) {
    problems.push("systemPromptMode must be 'append' or 'replace'");
  }
  if (config.systemPromptFile && !fs.existsSync(config.systemPromptFile)) {
    problems.push(`systemPromptFile does not exist: ${config.systemPromptFile}`);
  }
  validateToolLists(config, problems);
  validateDirectories(config, problems);
  validateMcpServers(config.mcpServers, problems);
  if (problems.length) {
    throw new ConfigError(`Invalid harness config:\n  - ${problems.join('\n  - ')}`);
  }
  return config;
}

/** `availableTools` / `excludedTools` / `disabledSkills` are null or string arrays. */
function validateToolLists(config, problems) {
  for (const key of ['availableTools', 'excludedTools', 'disabledSkills']) {
    const v = config[key];
    if (v != null && (!Array.isArray(v) || v.some((t) => typeof t !== 'string'))) {
      problems.push(`${key} must be an array of strings`);
    }
  }
}

/**
 * Plugin and skill directories must exist: the runtime skips a missing or
 * malformed directory silently, so catch the common case up front.
 */
function validateDirectories(config, problems) {
  for (const key of ['pluginDirectories', 'skillDirectories', 'builtinPluginDirectories']) {
    const dirs = config[key];
    if (dirs == null) continue;
    if (!Array.isArray(dirs)) { problems.push(`${key} must be an array`); continue; }
    dirs.forEach((dir, i) => {
      if (typeof dir !== 'string' || !dir) {
        problems.push(`${key}[${i}] must be a non-empty path string`);
      } else if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        problems.push(`${key}[${i}] is not a directory: ${dir}`);
      }
    });
  }
}

/**
 * Validate `config.mcpServers` as Record<name, MCPServerConfig>. In-process
 * (`type: 'sdk'`) entries from the Agent SDK sibling pass through untouched
 * so a swapped config still validates.
 */
function validateMcpServers(mcpServers, problems) {
  if (mcpServers == null) return;
  if (!isPlainObject(mcpServers)) { problems.push('mcpServers must be an object'); return; }
  for (const [name, srv] of Object.entries(mcpServers)) {
    if (!isPlainObject(srv)) { problems.push(`mcpServers.${name} must be an object`); continue; }
    if (srv.type === 'sdk') continue;
    if (srv.type === 'http' || srv.type === 'sse') {
      if (typeof srv.url !== 'string') problems.push(`mcpServers.${name}: ${srv.type} server requires a string url`);
    } else if (srv.type == null || srv.type === 'local' || srv.type === 'stdio') {
      if (typeof srv.command !== 'string') problems.push(`mcpServers.${name}: local server requires a string command`);
    } else {
      problems.push(`mcpServers.${name}: unknown server type "${srv.type}"`);
    }
    if (srv.tools != null && !Array.isArray(srv.tools)) problems.push(`mcpServers.${name}.tools must be an array`);
  }
}

/**
 * Resolve directory paths to absolute. The runtime is a separate process whose
 * working directory (`workingDirectory`) may differ from this one's, so a
 * relative path would resolve against the wrong root.
 */
export function resolveDirectories(dirs) {
  return Array.isArray(dirs) ? dirs.map((d) => path.resolve(d)) : [];
}

/**
 * Build the effective harness config.
 *
 * @param {object} [opts]
 * @param {string} [opts.configFile] JSON config file path
 * @param {object} [opts.overrides]  programmatic overrides (highest precedence)
 * @param {NodeJS.ProcessEnv} [opts.env] environment to consult
 */
export function loadConfig(opts = {}) {
  const { configFile, overrides, env = process.env } = opts;
  const config = mergeConfig(
    defaultConfig(env),
    loadConfigFile(configFile),
    configFromEnv(env),
    overrides,
  );
  // Resolve the proxy once so the rest of the harness never consults env.
  if (!config.httpProxy && config.proxyFromEnv) {
    config.httpProxy = env.COPILOT_CLI_PROXY ?? env.HTTPS_PROXY ?? env.HTTP_PROXY ?? null;
  }
  return validateConfig(config);
}

/** Resolve the system prompt text from inline config or instruction document. */
export function resolveSystemPrompt(config) {
  if (config.systemPrompt) return config.systemPrompt;
  if (config.systemPromptFile) {
    return fs.readFileSync(path.resolve(config.systemPromptFile), 'utf8');
  }
  return null;
}
