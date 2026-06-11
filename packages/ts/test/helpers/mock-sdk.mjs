/**
 * Mock of the @github/copilot-sdk client/session surface used by the
 * harness. Injected via the harness `deps.clientFactory` seam so unit tests
 * never spawn the Copilot CLI.
 *
 * A "script" drives responses: an array of steps (or a function of the
 * prompt) where each step is
 *   { content, inputTokens?, outputTokens?, events?: SessionEvent[] }
 */

let eventCounter = 0;

function makeEvent(type, data, extra = {}) {
  eventCounter += 1;
  return {
    id: `evt-${eventCounter}`,
    parentId: null,
    timestamp: new Date().toISOString(),
    type,
    data,
    ...extra,
  };
}

export class MockSession {
  constructor(config, script, { sessionId = 'mock-session-1' } = {}) {
    this.config = config;
    this.script = script;
    this.sessionId = config.sessionId ?? sessionId;
    this.typedHandlers = new Map();
    this.sent = [];
    this.disconnected = false;
  }

  on(typeOrHandler, maybeHandler) {
    const [type, handler] = typeof typeOrHandler === 'string'
      ? [typeOrHandler, maybeHandler]
      : ['*', typeOrHandler];
    if (!this.typedHandlers.has(type)) this.typedHandlers.set(type, []);
    this.typedHandlers.get(type).push(handler);
    return () => {
      const list = this.typedHandlers.get(type);
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  emitEvent(type, data, extra) {
    const event = makeEvent(type, data, extra);
    this.config.onEvent?.(event);
    for (const h of this.typedHandlers.get(type) ?? []) h(event);
    for (const h of this.typedHandlers.get('*') ?? []) h(event);
    return event;
  }

  _nextStep(prompt) {
    if (typeof this.script === 'function') return this.script(prompt);
    if (Array.isArray(this.script)) {
      if (!this.script.length) throw new Error('MockSession script exhausted');
      return this.script.shift();
    }
    return this.script ?? { content: 'ok' };
  }

  async sendAndWait(opts, _timeout) {
    const prompt = typeof opts === 'string' ? opts : opts.prompt;
    this.sent.push({ prompt, opts });
    const step = this._nextStep(prompt);

    for (const ev of step.events ?? []) {
      this.emitEvent(ev.type, ev.data, ev.extra);
    }

    if (this.config.streaming) {
      const chunkSize = Math.max(1, Math.ceil(step.content.length / 3));
      for (let i = 0; i < step.content.length; i += chunkSize) {
        this.emitEvent('assistant.message_delta', {
          deltaContent: step.content.slice(i, i + chunkSize),
        }, { ephemeral: true });
      }
    }

    this.emitEvent('assistant.usage', {
      model: this.config.model ?? 'mock-model',
      inputTokens: step.inputTokens ?? 10,
      outputTokens: step.outputTokens ?? 5,
      duration: step.duration ?? 42,
      timeToFirstTokenMs: step.ttft ?? 7,
    }, { ephemeral: true });

    const message = this.emitEvent('assistant.message', { content: step.content });
    this.emitEvent('session.idle', {});
    return message;
  }

  async disconnect() {
    this.disconnected = true;
  }
}

export class MockClient {
  /**
   * @param {object} options client options captured for assertions
   * @param {object} [behavior] { script, failResume, resumeScripts }
   */
  constructor(options = {}, behavior = {}) {
    this.options = options;
    this.behavior = behavior;
    this.sessions = [];
    this.stopped = false;
    this.lastSessionConfig = null;
  }

  async createSession(config) {
    this.lastSessionConfig = config;
    const session = new MockSession(config, this.behavior.script, {
      sessionId: `mock-session-${this.sessions.length + 1}`,
    });
    this.sessions.push(session);
    return session;
  }

  async resumeSession(sessionId, config) {
    if (this.behavior.failResume) {
      throw new Error(`session not found: ${sessionId}`);
    }
    this.lastSessionConfig = config;
    const session = new MockSession(
      { ...config, sessionId },
      this.behavior.resumeScript ?? this.behavior.script,
    );
    this.sessions.push(session);
    return session;
  }

  async stop() {
    this.stopped = true;
    return [];
  }
}

/**
 * Build harness deps wiring a MockClient. Returns { deps, ref } where
 * ref.client is set once the harness starts.
 */
export function mockDeps(behavior = {}, env = {}) {
  const ref = { client: null };
  const deps = {
    env: { ...env },
    clientFactory: async (options) => {
      ref.client = new MockClient(options, behavior);
      return ref.client;
    },
  };
  return { deps, ref };
}
