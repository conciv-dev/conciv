import {expect, onTestFinished} from 'vitest'
import {commands} from 'vitest/browser'
import type {TestLLM} from '@conciv/harness-testkit'
import type {CreateEngineOptions, Engine, EngineSession} from './engine.js'
import type {} from './browser-commands.js'

export * as TestLLM from '@conciv/harness-testkit/test-llm'

function sessionOn(engineId: string, id: string): EngineSession {
  return {
    id,
    send: (text) => commands.concivSend(engineId, id, text),
    approve: () => commands.concivApprove(engineId, id),
    stop: () => commands.concivStop(engineId, id),
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

export async function createEngine(options: CreateEngineOptions = {}): Promise<Engine> {
  if (options.harness !== undefined) {
    throw new Error('a harness adapter cannot reach the engine in browser mode: test it in node or happy-dom')
  }
  if (options.replies?.some((reply) => !Array.isArray(reply))) {
    throw new Error('a streamed reply cannot reach the engine in browser mode: test it in node or happy-dom')
  }
  const inTest = expect.getState().currentTestName !== undefined
  const handle = await commands.concivCreateEngine(options, inTest ? 'test' : 'file')
  if (inTest) onTestFinished(() => commands.concivStopEngine(handle.id))
  return {
    session: sessionOn(handle.id, handle.sessionId),
    newSession: async (title) => sessionOn(handle.id, await commands.concivNewSession(handle.id, title)),
    setting: (setting) => commands.concivSetting(handle.id, setting),
    gate: async () => gateOn(handle.id, await commands.concivGate(handle.id)),
    requests: () => commands.concivRequests(handle.id),
    address: handle.address,
  }
}
