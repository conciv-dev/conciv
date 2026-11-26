import type {Gate, ModelRequest, Reply} from '@conciv/simulation/test-llm'
import {hang} from '@conciv/simulation/test-llm'
import type {ConcivConfig} from '@conciv/types/config-types'
import type {
  CreateBackend,
  Engine,
  EngineAddress,
  EngineSession,
  EngineSetting,
  EngineStart,
  StartedEngine,
  ToolFailure,
} from './engine.js'
import type {Outside, OutsideAgent, OutsideReply} from './outside.js'
import type {EngineDrive} from './drive.js'

export type EngineHandle = {id: string; sessionId: string; address: EngineAddress; root: string; home: string}

type EventWait = Awaited<ReturnType<Engine['event']>>

export type EngineCommands = {
  concivCreateEngine: (config: ConcivConfig, options: EngineStart) => Promise<EngineHandle>
  concivStopEngine: (engineId: string) => Promise<void>
  concivNewSession: (engineId: string, title?: string) => Promise<string>
  concivSetting: (engineId: string, setting: EngineSetting) => Promise<void>
  concivGate: (engineId: string) => Promise<string>
  concivGateStarted: (engineId: string, gateId: string) => Promise<void>
  concivGateRelease: (engineId: string, gateId: string) => Promise<void>
  concivRequests: (engineId: string) => Promise<ModelRequest[]>
  concivEvent: (engineId: string, type: string, match: Parameters<Engine['event']>[1]) => Promise<string>
  concivEventArrived: (engineId: string, waitId: string) => EventWait['arrived']
  concivRpcCall: (engineId: string, rpcId: string, method: string, input: unknown) => Promise<unknown>
  concivRpcFailure: (
    engineId: string,
    rpcId: string,
    method: string,
    input: unknown,
  ) => ReturnType<Engine['rpc']['failure']>
  concivLoginCode: (engineId: string) => Promise<string>
  concivRevokeBrowsers: (engineId: string) => Promise<void>
  concivRestart: (engineId: string) => Promise<void>
  concivClockTick: (engineId: string) => Promise<void>
  concivClockDrain: (engineId: string) => Promise<void>
  concivOpened: (engineId: string) => ReturnType<Engine['opened']>
  concivSend: (engineId: string, sessionId: string, text: string) => Promise<void>
  concivApprove: (engineId: string, sessionId: string) => Promise<void>
  concivStop: (engineId: string, sessionId: string) => Promise<void>
  concivToolCall: (engineId: string, sessionId: string, name: string, input: unknown) => Promise<unknown>
  concivToolFailure: (engineId: string, sessionId: string, name: string, input: unknown) => Promise<ToolFailure>
  concivOutsideDescribe: (engineId: string, agent: OutsideAgent) => ReturnType<Outside['describe']>
  concivOutsideDiscover: (engineId: string, agent: OutsideAgent, toolNames: string[]) => Promise<OutsideReply>
  concivOutsideCall: (engineId: string, agent: OutsideAgent, name: string, input: unknown) => Promise<OutsideReply>
  concivReply: (engineId: string, replies: (Reply | 'hang')[]) => Promise<void>
  concivStale: (engineId: string, staleness: Parameters<Engine['stale']>[0]) => Promise<void>
  concivVersion: (engineId: string, version: string) => Promise<void>
  concivCommit: (engineId: string, message: string) => Promise<void>
  concivWrite: (engineId: string, path: string, content: string) => Promise<void>
  concivDriveAnswer: (engineId: string, value: string) => Promise<void>
  concivDriveTypeInto: (
    engineId: string,
    role: string,
    label: string,
    value: string,
  ) => ReturnType<EngineDrive['typeInto']>
  concivDriveClickByRole: (engineId: string, role: string, label: string) => ReturnType<EngineDrive['clickByRole']>
  concivDriveSnapshot: (engineId: string) => ReturnType<EngineDrive['snapshot']>
}

export type EngineCommandHandlers = {
  [Name in keyof EngineCommands]: (
    context: unknown,
    ...payload: Parameters<EngineCommands[Name]>
  ) => ReturnType<EngineCommands[Name]>
}

type BrowserEngine = {
  started: StartedEngine
  sessions: Record<string, EngineSession>
  gates: Record<string, Gate>
  waits: Record<string, EventWait>
}

export function engineCommands(
  start: (createBackend: CreateBackend, config: ConcivConfig, options: EngineStart) => Promise<StartedEngine>,
  createBackend: () => Promise<CreateBackend>,
): {commands: EngineCommandHandlers; close: () => Promise<void>} {
  const engines: Record<string, BrowserEngine> = {}
  const counter = {next: 0}
  const nextId = (): string => {
    counter.next += 1
    return String(counter.next)
  }
  const engineFor = (engineId: string): BrowserEngine => {
    const found = engines[engineId]
    if (found === undefined) throw new Error(`no engine ${engineId}: it was never made or has stopped`)
    return found
  }
  const engine = (engineId: string): StartedEngine => engineFor(engineId).started
  const sessionFor = (engineId: string, sessionId: string): EngineSession => {
    const found = engineFor(engineId).sessions[sessionId]
    if (found === undefined) throw new Error(`engine ${engineId} has no session ${sessionId}`)
    return found
  }
  const gateFor = (engineId: string, gateId: string): Gate => {
    const found = engineFor(engineId).gates[gateId]
    if (found === undefined) throw new Error(`engine ${engineId} has no gate ${gateId}`)
    return found
  }
  const stop = async (engineId: string): Promise<void> => {
    const found = engines[engineId]
    delete engines[engineId]
    await found?.started.stop()
  }
  const close = async (): Promise<void> => {
    const stopped = await Promise.allSettled(Object.keys(engines).map(stop))
    const failures = stopped.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []))
    if (failures.length > 0) throw new AggregateError(failures, 'an engine made in browser mode did not stop cleanly')
  }
  return {
    close,
    commands: {
      concivCreateEngine: async (_context, config, options) => {
        const started = await start(await createBackend(), config, options)
        const id = nextId()
        engines[id] = {started, sessions: {[started.session.id]: started.session}, gates: {}, waits: {}}
        return {id, sessionId: started.session.id, address: started.address, root: started.root, home: started.home}
      },
      concivStopEngine: (_context, engineId) => stop(engineId),
      concivNewSession: async (_context, engineId, title) => {
        const session = await engine(engineId).newSession(title)
        engineFor(engineId).sessions[session.id] = session
        return session.id
      },
      concivSetting: (_context, engineId, setting) => engine(engineId).setting(setting),
      concivGate: async (_context, engineId) => {
        const gateId = nextId()
        engineFor(engineId).gates[gateId] = await engine(engineId).gate()
        return gateId
      },
      concivGateStarted: (_context, engineId, gateId) => gateFor(engineId, gateId).started,
      concivGateRelease: async (_context, engineId, gateId) => {
        const gate = gateFor(engineId, gateId)
        delete engineFor(engineId).gates[gateId]
        await gate.release()
      },
      concivRequests: (_context, engineId) => engine(engineId).requests(),
      concivEvent: async (_context, engineId, type, match) => {
        const waitId = nextId()
        engineFor(engineId).waits[waitId] = await engine(engineId).event(type, match)
        return waitId
      },
      concivEventArrived: (_context, engineId, waitId) => {
        const owner = engineFor(engineId)
        const wait = owner.waits[waitId]
        if (wait === undefined) throw new Error(`engine ${engineId} has no event wait ${waitId}`)
        delete owner.waits[waitId]
        return wait.arrived
      },
      concivRpcCall: (_context, engineId, rpcId, method, input) => engine(engineId).rpc.call(rpcId, method, input),
      concivRpcFailure: (_context, engineId, rpcId, method, input) =>
        engine(engineId).rpc.failure(rpcId, method, input),
      concivLoginCode: (_context, engineId) => engine(engineId).loginCode(),
      concivRevokeBrowsers: (_context, engineId) => engine(engineId).revokeBrowsers(),
      concivRestart: (_context, engineId) => engine(engineId).restart(),
      concivClockTick: (_context, engineId) => engine(engineId).tick(),
      concivClockDrain: (_context, engineId) => engine(engineId).clock.drain(),
      concivOpened: (_context, engineId) => engine(engineId).opened(),
      concivSend: (_context, engineId, sessionId, text) => sessionFor(engineId, sessionId).send(text),
      concivApprove: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).approve(),
      concivStop: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).stop(),
      concivToolCall: (_context, engineId, sessionId, name, input) =>
        sessionFor(engineId, sessionId).tool(name).call(input),
      concivToolFailure: (_context, engineId, sessionId, name, input) =>
        sessionFor(engineId, sessionId).tool(name).failure(input),
      concivOutsideDescribe: (_context, engineId, agent) => engine(engineId).outside(agent).describe(),
      concivOutsideDiscover: (_context, engineId, agent, toolNames) =>
        engine(engineId).outside(agent).discover(toolNames),
      concivOutsideCall: (_context, engineId, agent, name, input) => engine(engineId).outside(agent).call(name, input),
      concivReply: (_context, engineId, replies) =>
        engine(engineId).reply(...replies.map((reply) => (reply === 'hang' ? hang() : reply))),
      concivStale: (_context, engineId, staleness) => engine(engineId).stale(staleness),
      concivVersion: (_context, engineId, version) => engine(engineId).version(version),
      concivCommit: (_context, engineId, message) => engine(engineId).commit(message),
      concivWrite: (_context, engineId, path, content) => engine(engineId).write(path, content),
      concivDriveAnswer: async (_context, engineId, value) => (await engine(engineId).drive()).answer(value),
      concivDriveTypeInto: async (_context, engineId, role, label, value) =>
        (await engine(engineId).drive()).typeInto(role, label, value),
      concivDriveClickByRole: async (_context, engineId, role, label) =>
        (await engine(engineId).drive()).clickByRole(role, label),
      concivDriveSnapshot: async (_context, engineId) => (await engine(engineId).drive()).snapshot(),
    },
  }
}
