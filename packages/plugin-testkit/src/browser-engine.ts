import {expect, onTestFinished} from 'vitest'
import {commands} from 'vitest/browser'
import type {TestLLM} from '@conciv/harness-testkit'
import type {CreateEngineOptions, Engine, EngineClock, EngineSession} from './engine.js'
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

const ADVANCE_LIMIT_MS = 15_000

const NEVER_SETTLED = 'the engine clock was advanced for 15s and the awaited call never settled'

const REAL_CLOCK = "this engine runs on the real clock: make it with clock: 'test'"

async function advanceOn<T>(engineId: string, until: Promise<T>): Promise<T> {
  const watch = {settled: false}
  until
    .finally(() => {
      watch.settled = true
    })
    .catch(() => {})
  const deadline = performance.now() + ADVANCE_LIMIT_MS
  while (!watch.settled && performance.now() < deadline) await commands.concivClockTick(engineId)
  if (!watch.settled) throw new Error(NEVER_SETTLED)
  return until
}

function clockOn(engineId: string, clock: CreateEngineOptions['clock']): EngineClock {
  if (clock !== 'test') {
    return {
      advance: async () => {
        throw new Error(REAL_CLOCK)
      },
      drain: async () => {
        throw new Error(REAL_CLOCK)
      },
    }
  }
  return {advance: (until) => advanceOn(engineId, until), drain: () => commands.concivClockDrain(engineId)}
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
    opened: () => commands.concivOpened(handle.id),
    loginCode: () => commands.concivLoginCode(handle.id),
    revokeBrowsers: () => commands.concivRevokeBrowsers(handle.id),
    restart: () => commands.concivRestart(handle.id),
    clock: clockOn(handle.id, options.clock),
    rpc: {
      call: (rpcId, method, input) => commands.concivRpcCall(handle.id, rpcId, method, input),
      failure: (rpcId, method, input) => commands.concivRpcFailure(handle.id, rpcId, method, input),
    },
    event: async (type) => {
      const waitId = await commands.concivEvent(handle.id, type)
      const arrived = commands.concivEventArrived(handle.id, waitId)
      arrived.catch(() => {})
      return {arrived}
    },
    outside: (agent = {}) => ({
      describe: () => commands.concivOutsideDescribe(handle.id, agent),
      discover: (toolNames) => commands.concivOutsideDiscover(handle.id, agent, toolNames),
      call: (name, input) => commands.concivOutsideCall(handle.id, agent, name, input),
    }),
    address: handle.address,
    root: handle.root,
  }
}
