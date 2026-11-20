import {expect, onTestFinished} from 'vitest'
import {commands} from 'vitest/browser'
import type {TestLLM} from '@conciv/harness-testkit'
import type {CreateEngineOptions, Engine, EngineAddress, EngineSession} from './engine.js'
import type {} from './browser-commands.js'

export * as TestLLM from '@conciv/harness-testkit/test-llm'

const addresses = new WeakMap<Engine, EngineAddress>()

function sessionOn(engineId: string, id: string): EngineSession {
  return {
    id,
    send: (text) => commands.concivSend(engineId, id, text),
    approve: (reply = 'once') => commands.concivApprove(engineId, id, reply),
    stop: () => commands.concivStop(engineId, id),
    messages: () => commands.concivMessages(engineId, id),
    rename: (title) => commands.concivRename(engineId, id, title),
    compact: () => commands.concivCompact(engineId, id),
    model: (model) => commands.concivModel(engineId, id, model),
    effort: (effort) => commands.concivEffort(engineId, id, effort),
    remove: () => commands.concivRemove(engineId, id),
    tool: (name) => ({
      call: (input) => commands.concivToolCall(engineId, id, name, input),
      failure: (input) => commands.concivToolFailure(engineId, id, name, input),
    }),
  }
}

function gateOn(engineId: string, gateId: string): TestLLM.Gate {
  return {
    started: commands.concivGateStarted(engineId, gateId),
    release: () => commands.concivGateRelease(engineId, gateId),
  }
}

function plainReply(reply: TestLLM.Response): TestLLM.Response {
  if (!Array.isArray(reply)) {
    throw new Error('a streamed reply cannot reach the engine in browser mode: test it in node or happy-dom')
  }
  return reply
}

export async function createEngine(options: CreateEngineOptions = {}): Promise<Engine> {
  if (options.harness !== undefined) {
    throw new Error('a harness adapter cannot reach the engine in browser mode: test it in node or happy-dom')
  }
  options.replies?.forEach(plainReply)
  if (options.fallback !== undefined) plainReply(options.fallback)
  const inTest = expect.getState().currentTestName !== undefined
  const handle = await commands.concivCreateEngine(options, inTest ? 'test' : 'file')
  if (inTest) onTestFinished(() => commands.concivStopEngine(handle.id))
  const engine: Engine = {
    session: sessionOn(handle.id, handle.sessionId),
    newSession: async (title) => sessionOn(handle.id, await commands.concivNewSession(handle.id, title)),
    sessionById: (id) => sessionOn(handle.id, id),
    sessions: () => commands.concivSessions(handle.id),
    setting: (setting) => commands.concivSetting(handle.id, setting),
    gate: async () => gateOn(handle.id, await commands.concivGate(handle.id)),
    requests: () => commands.concivRequests(handle.id),
    push: async (...replies) => commands.concivPush(handle.id, replies.map(plainReply)),
    always: async (reply) => commands.concivAlways(handle.id, plainReply(reply)),
    serve: async () => {
      throw new Error('serve is not available in browser mode: a function cannot cross to the engine')
    },
    wait: (count) => commands.concivWait(handle.id, count),
  }
  addresses.set(engine, handle.address)
  return engine
}

export function engineAddress(engine: Engine): EngineAddress {
  const address = addresses.get(engine)
  if (!address) throw new Error('mount needs an engine made by createEngine from @conciv/plugin-testkit/node')
  return address
}
