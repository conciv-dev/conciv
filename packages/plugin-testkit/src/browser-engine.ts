import {expect, onTestFinished} from 'vitest'
import {commands} from 'vitest/browser'
import type {TestLLM} from '@conciv/harness-testkit'
import {advanceUntil, refuseRealClock} from '@conciv/harness-testkit/clock'
import {hang} from '@conciv/harness-testkit/test-llm'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {Engine, EngineClock, EngineSession, EngineStart} from './engine.js'
import type {} from './browser-commands.js'

export * as TestLLM from '@conciv/harness-testkit/test-llm'

function crossing(reply: TestLLM.Reply): TestLLM.Reply | 'hang' {
  if (reply === hang()) return 'hang'
  if (typeof reply === 'function') throw new Error('a function reply cannot cross to the engine in browser mode')
  return reply
}

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

function clockOn(engineId: string, clock: EngineStart['clock']): EngineClock {
  if (clock !== 'test') return {advance: refuseRealClock, drain: refuseRealClock}
  return {
    advance: (until) => advanceUntil(until, () => commands.concivClockTick(engineId)),
    drain: () => commands.concivClockDrain(engineId),
  }
}

function gateOn(engineId: string, gateId: string): TestLLM.Gate {
  return {
    started: commands.concivGateStarted(engineId, gateId),
    release: () => commands.concivGateRelease(engineId, gateId),
  }
}

export async function createEngine(config: ConcivConfig = {}, options: EngineStart = {}): Promise<Engine> {
  const inTest = expect.getState().currentTestName !== undefined
  const handle = await commands.concivCreateEngine(config, options, inTest ? 'test' : 'file')
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
    event: async (type, match) => {
      const waitId = await commands.concivEvent(handle.id, type, match)
      const arrived = commands.concivEventArrived(handle.id, waitId)
      arrived.catch(() => {})
      return {arrived}
    },
    outside: (agent = {}) => ({
      describe: () => commands.concivOutsideDescribe(handle.id, agent),
      discover: (toolNames) => commands.concivOutsideDiscover(handle.id, agent, toolNames),
      call: (name, input) => commands.concivOutsideCall(handle.id, agent, name, input),
    }),
    reply: async (...replies) => {
      await commands.concivReply(handle.id, replies.map(crossing))
    },
    stale: (staleness) => commands.concivStale(handle.id, staleness),
    version: (version) => commands.concivVersion(handle.id, version),
    write: (path, content) => commands.concivWrite(handle.id, path, content),
    commit: (message) => commands.concivCommit(handle.id, message),
    address: handle.address,
    root: handle.root,
    home: handle.home,
  }
}
