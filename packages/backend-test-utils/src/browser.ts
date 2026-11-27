import {test as base, type TestAPI} from 'vitest'
import {commands} from 'vitest/browser'
import {hang, type Gate, type Reply} from '@conciv/simulation/test-llm'
import {advanceUntil, refuseRealClock} from '@internal/engine-kit/clock-steps'
import type {
  Engine,
  EngineClock,
  EngineCommands,
  EngineFixtures,
  EngineHandle,
  EngineSession,
  EngineStart,
} from '@internal/engine-kit'
import {testKitErrors} from '@conciv/errors'

declare module 'vitest/browser' {
  interface BrowserCommands extends EngineCommands {}
}

export type {
  Engine,
  EngineAddress,
  EngineClock,
  EngineFixtures,
  EngineSession,
  EngineSetting,
  EngineStart,
  EngineTool,
  ToolFailure,
  Outside,
  OutsideAgent,
  OutsideReply,
} from '@internal/engine-kit'
export * as TestLLM from '@conciv/simulation/test-llm'
export type {ScriptedHarness, ScriptedSession} from '@conciv/simulation/scripted-harness'

export function pluginDirectory(target: string): never {
  throw testKitErrors.DISK_IN_BROWSER({target})
}

function crossing(reply: Reply): Reply | 'hang' {
  if (reply === hang()) return 'hang'
  if (typeof reply === 'function') throw testKitErrors.FUNCTION_REPLY_IN_BROWSER()
  return reply
}

function crossingStart(options: EngineStart): EngineStart {
  if (options.harness !== undefined) throw testKitErrors.HARNESS_IN_BROWSER()
  if (options.plugins?.some((plugin) => typeof plugin !== 'string')) {
    throw testKitErrors.PLUGIN_OBJECT_IN_BROWSER()
  }
  return options
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

function gateOn(engineId: string, gateId: string): Gate {
  return {
    started: commands.concivGateStarted(engineId, gateId),
    release: () => commands.concivGateRelease(engineId, gateId),
  }
}

function engineOn(handle: EngineHandle, options: EngineStart): Engine {
  const id = handle.id
  return {
    session: sessionOn(id, handle.sessionId),
    newSession: async (title) => sessionOn(id, await commands.concivNewSession(id, title)),
    setting: (setting) => commands.concivSetting(id, setting),
    gate: async () => gateOn(id, await commands.concivGate(id)),
    requests: () => commands.concivRequests(id),
    opened: () => commands.concivOpened(id),
    loginCode: () => commands.concivLoginCode(id),
    revokeBrowsers: () => commands.concivRevokeBrowsers(id),
    restart: () => commands.concivRestart(id),
    clock: clockOn(id, options.clock),
    rpc: {
      call: (rpcId, method, input) => commands.concivRpcCall(id, rpcId, method, input),
      failure: (rpcId, method, input) => commands.concivRpcFailure(id, rpcId, method, input),
    },
    event: async (type, match) => {
      const waitId = await commands.concivEvent(id, type, match)
      const arrived = commands.concivEventArrived(id, waitId)
      arrived.catch(() => {})
      return {arrived}
    },
    outside: (agent = {}) => ({
      describe: () => commands.concivOutsideDescribe(id, agent),
      discover: (toolNames) => commands.concivOutsideDiscover(id, agent, toolNames),
      call: (name, input) => commands.concivOutsideCall(id, agent, name, input),
    }),
    reply: async (...replies) => {
      await commands.concivReply(id, replies.map(crossing))
    },
    stale: (staleness) => commands.concivStale(id, staleness),
    version: (version) => commands.concivVersion(id, version),
    write: (path, content) => commands.concivWrite(id, path, content),
    commit: (message) => commands.concivCommit(id, message),
    drive: async () => ({
      answer: (value) => commands.concivDriveAnswer(id, value),
      typeInto: (role, label, value) => commands.concivDriveTypeInto(id, role, label, value),
      clickByRole: (role, label) => commands.concivDriveClickByRole(id, role, label),
      snapshot: () => commands.concivDriveSnapshot(id),
    }),
    address: handle.address,
    root: handle.root,
    home: handle.home,
  }
}

export const test: TestAPI<EngineFixtures> = base.extend<EngineFixtures>({
  createEngine: async ({task: _task}, use) => {
    const started: string[] = []
    await use(async (config = {}, options = {}) => {
      const handle = await commands.concivCreateEngine(config, crossingStart(options))
      started.push(handle.id)
      return engineOn(handle, options)
    })
    const stopped = await Promise.allSettled(started.map((id) => commands.concivStopEngine(id)))
    const failures = stopped.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []))
    if (failures.length > 0) throw new AggregateError(failures, 'an engine the test started did not stop cleanly')
  },
})
