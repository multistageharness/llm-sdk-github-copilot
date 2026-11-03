/**
 * Example 25 — Policy-Gated Investigation & Verified Structured Synthesis
 *
 * Patterns demonstrated:
 *   - P0 / P-00: Pre-spawn requirePrompt guard (0 tokens on empty input) & guaranteed stop()
 *   - C1 / P-30: Custom tool registration with handler-side PII redaction (E3 / P-43)
 *   - C2 / P-31: Qualified-name-aware beforeToolCall policy gate with toolUseId deduplication
 *   - B1-B3 / P-34-P-36: Schema-validated structured output + deterministic citation & verdict checks
 *   - E4 / P-46: Usage and tool telemetry written to stderr; pure JSON written to stdout
 *
 * Run:
 *   node examples/25-policy-gated-investigator.mjs "Investigate INC-402 and recommend remediation"
 */

import {
  createHarness,
  parseCommonArgs,
  requirePrompt,
  baseConfig,
  runExample,
} from './_shared.mjs';

const args = parseCommonArgs();
const rawPrompt = requirePrompt(
  args,
  'node examples/25-policy-gated-investigator.mjs "<investigation-prompt>"'
);

function redactSensitiveText(text) {
  return String(text)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
    .replace(/\bsk-[a-zA-Z0-9_-]{16,}\b/g, '[REDACTED_SECRET]');
}

const sanitizedPrompt = redactSensitiveText(rawPrompt);

const INCIDENT_RECORDS = {
  'INC-402': {
    id: 'INC-402',
    service: 'checkout-gateway',
    summary:
      'Elevated HTTP 503 errors from upstream payment pool at 10.24.88.19 reported by oncall@corp.example.com.',
    errorRatePercent: 18.4,
    latencyP95Ms: 4250,
  },
  'RUNBOOK-09': {
    id: 'RUNBOOK-09',
    service: 'checkout-gateway',
    summary:
      'If errorRatePercent > 15% and latencyP95Ms > 3000ms, drain degraded pool node and page SRE.',
    thresholdErrorRate: 15.0,
  },
};

const INVESTIGATION_SCHEMA = {
  type: 'object',
  required: [
    'incidentId',
    'rootCauseSummary',
    'severityScore',
    'citations',
    'recommendedAction',
  ],
  additionalProperties: false,
  properties: {
    incidentId: { type: 'string', minLength: 3, maxLength: 32 },
    rootCauseSummary: { type: 'string', minLength: 10, maxLength: 500 },
    severityScore: { type: 'integer', minimum: 1, maximum: 10 },
    citations: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string' },
    },
    recommendedAction: {
      type: 'string',
      enum: ['monitor_only', 'drain_node_and_page_sre', 'rollback_deployment'],
    },
  },
};

const APPROVED_BARE_TOOLS = new Set(['fetch_incident_telemetry']);
const decisionCache = new Map();

const harness = await createHarness({
  config: baseConfig(args, {
    maxTurns: 6,
    maxToolIterations: 6,
    systemPrompt:
      'Operate as a deterministic SRE investigator. Use fetch_incident_telemetry to inspect records. ' +
      'Ground every claim in the returned records and cite only valid record IDs.',
    systemPromptMode: 'append',
  }),
  hooks: {
    beforeRun: async ({ prompt }) => {
      if (/\bsk-[a-zA-Z0-9_-]{16,}\b/.test(prompt)) {
        throw new Error('Policy Veto: Unredacted secret token detected in prompt.');
      }
    },
    beforeToolCall: async ({ toolName, toolUseId }) => {
      if (toolUseId && decisionCache.has(toolUseId)) {
        return decisionCache.get(toolUseId);
      }
      const bareName = String(toolName).replace(/^mcp__[^_]+__/, '');
      const decision = APPROVED_BARE_TOOLS.has(bareName)
        ? undefined
        : {
            deny: true,
            reason: `Tool "${toolName}" (bare: "${bareName}") is blocked by policy. Recommend action in output instead.`,
          };
      if (toolUseId) decisionCache.set(toolUseId, decision);
      console.error(
        `[hook:beforeToolCall] tool=${toolName} bare=${bareName} denied=${Boolean(decision?.deny)}`
      );
      return decision;
    },
  },
});

harness.registerTool({
  name: 'fetch_incident_telemetry',
  description: 'Fetch telemetry and runbook snippets for an incident ID (e.g., INC-402).',
  parameters: {
    type: 'object',
    required: ['incidentId'],
    additionalProperties: false,
    properties: {
      incidentId: { type: 'string' },
    },
  },
  handler: async ({ incidentId }) => {
    const cleanId = redactSensitiveText(incidentId).trim();
    const record = INCIDENT_RECORDS[cleanId];
    if (!record) {
      return JSON.stringify({ error: `No telemetry found for ${cleanId}` });
    }
    const safeRecord = {
      ...record,
      summary: redactSensitiveText(record.summary),
    };
    return JSON.stringify({
      incident: safeRecord,
      applicableRunbook: INCIDENT_RECORDS['RUNBOOK-09'],
    });
  },
});

harness.registerTool({
  name: 'restart_production_pool',
  description: 'Force-restart the upstream production payment pool.',
  parameters: {
    type: 'object',
    required: ['service'],
    additionalProperties: false,
    properties: {
      service: { type: 'string' },
    },
  },
  handler: async ({ service }) => JSON.stringify({ status: 'restarted', service }),
});

harness.on('tool:denied', (ev) => console.error(`[event:tool:denied] ${JSON.stringify(ev)}`));
harness.on('structured:invalid', (ev) =>
  console.error(`[event:structured:invalid] attempt=${ev.attempt}`)
);
harness.on('structured:ok', (ev) =>
  console.error(`[event:structured:ok] attempts=${ev.attempts}`)
);

await runExample(harness, async () => {
  const { value, attempts, usage } = await harness.structured(
    sanitizedPrompt,
    INVESTIGATION_SCHEMA,
    {
      input: { availableIncidentIds: Object.keys(INCIDENT_RECORDS) },
      inputLabel: 'investigation_scope',
    }
  );

  const validIds = new Set(Object.keys(INCIDENT_RECORDS));
  const invalidCitations = value.citations.filter((id) => !validIds.has(id));
  if (invalidCitations.length > 0) {
    throw new Error(
      `Hallucinated citation IDs rejected by verifier: ${invalidCitations.join(', ')}`
    );
  }

  const verifiedReport = {
    ...value,
    requiresImmediatePaging: value.severityScore >= 7,
    verificationMetadata: {
      schemaAttempts: attempts,
      citationsVerified: true,
    },
  };

  console.error(
    `[diagnostics] Completed in ${attempts} attempt(s); tokens=${usage?.totalTokens ?? 0}`
  );
  console.log(JSON.stringify(verifiedReport, null, 2));
});
