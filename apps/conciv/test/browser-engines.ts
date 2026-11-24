import type {Plugin} from 'vite'
import type {BrowserCommandContext} from 'vitest/node'
import type {} from 'vitest/config'
import type {TestLLM} from '@conciv/harness-testkit'
import {hang} from '@conciv/harness-testkit/test-llm'
import {startEngine, type Engine, type EngineSession, type StartedEngine} from './engine.js'
import {disposeAll} from './dispose.js'
import {engineCoverage} from './engine-coverage.js'
import type {EngineCommands} from './browser-commands.js'

const PREBUNDLED = [
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client',
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client/byok',
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client/devtools',
  '@conciv/mascot > gsap',
  '@conciv/mascot > gsap/MotionPathPlugin',
  '@conciv/ui-kit-chat > mermaid',
  '@tanstack/hotkeys',
  '@tanstack/solid-hotkeys',
  '@solid-primitives/mutation-observer',
  'semver/functions/lt',
  'semver/functions/valid',
]

type EngineCommandHandlers = {
  [Name in keyof EngineCommands]: (
    context: BrowserCommandContext,
    ...args: Parameters<EngineCommands[Name]>
  ) => ReturnType<EngineCommands[Name]>
}

type BrowserEngine = {
  started: StartedEngine
  sessions: Record<string, EngineSession>
  gates: Record<string, TestLLM.Gate>
  waits: Record<string, Awaited<ReturnType<Engine['event']>>>
  testPath: string | undefined
  scope: 'test' | 'file'
}

function browserEngines(): {commands: EngineCommandHandlers; plugin: Plugin} {
  const engines: Record<string, BrowserEngine> = {}
  const counter = {next: 0}
  const coverage = engineCoverage()
  const engineFor = (engineId: string): BrowserEngine => {
    const found = engines[engineId]
    if (!found) throw new Error(`no engine ${engineId}: it was never made or has stopped`)
    return found
  }
  const sessionFor = (engineId: string, sessionId: string): EngineSession => {
    const found = engineFor(engineId).sessions[sessionId]
    if (!found) throw new Error(`engine ${engineId} has no session ${sessionId}`)
    return found
  }
  const gateFor = (engineId: string, gateId: string): TestLLM.Gate => {
    const found = engineFor(engineId).gates[gateId]
    if (!found) throw new Error(`engine ${engineId} has no gate ${gateId}`)
    return found
  }
  const stop = async (engineId: string): Promise<void> => {
    const found = engines[engineId]
    delete engines[engineId]
    await found?.started.stop()
  }
  const stopWhere = (keep: (engine: BrowserEngine) => boolean): Promise<void> =>
    disposeAll(
      Object.entries(engines).flatMap(([engineId, engine]) => (keep(engine) ? [() => stop(engineId)] : [])),
      'sequential',
      'an engine made in browser mode did not stop cleanly',
    )
  return {
    commands: {
      concivCreateEngine: async (context, config, options, scope) => {
        await coverage.start(context)
        const started = await startEngine(config, options)
        counter.next += 1
        const id = String(counter.next)
        engines[id] = {
          started,
          sessions: {[started.engine.session.id]: started.engine.session},
          gates: {},
          waits: {},
          testPath: context.testPath,
          scope,
        }
        return {
          id,
          sessionId: started.engine.session.id,
          address: started.engine.address,
          root: started.engine.root,
          home: started.engine.home,
        }
      },
      concivStopEngine: (_context, engineId) => stop(engineId),
      concivStopFileEngines: async (context) => {
        await stopWhere((engine) => engine.testPath === context.testPath && engine.scope === 'file')
        await coverage.hand(context)
      },
      concivNewSession: async (_context, engineId, title) => {
        const engine = engineFor(engineId)
        const session = await engine.started.engine.newSession(title)
        engine.sessions[session.id] = session
        return session.id
      },
      concivSetting: (_context, engineId, setting) => engineFor(engineId).started.engine.setting(setting),
      concivGate: async (_context, engineId) => {
        const engine = engineFor(engineId)
        counter.next += 1
        const gateId = String(counter.next)
        engine.gates[gateId] = await engine.started.engine.gate()
        return gateId
      },
      concivEvent: async (_context, engineId, type, match) => {
        const engine = engineFor(engineId)
        counter.next += 1
        const waitId = String(counter.next)
        engine.waits[waitId] = await engine.started.engine.event(type, match)
        return waitId
      },
      concivEventArrived: (_context, engineId, waitId) => {
        const engine = engineFor(engineId)
        const wait = engine.waits[waitId]
        if (!wait) throw new Error(`engine ${engineId} has no event wait ${waitId}`)
        delete engine.waits[waitId]
        return wait.arrived
      },
      concivRpcCall: (_context, engineId, rpcId, method, input) =>
        engineFor(engineId).started.engine.rpc.call(rpcId, method, input),
      concivRpcFailure: (_context, engineId, rpcId, method, input) =>
        engineFor(engineId).started.engine.rpc.failure(rpcId, method, input),
      concivLoginCode: (_context, engineId) => engineFor(engineId).started.engine.loginCode(),
      concivRevokeBrowsers: (_context, engineId) => engineFor(engineId).started.engine.revokeBrowsers(),
      concivRestart: (_context, engineId) => engineFor(engineId).started.engine.restart(),
      concivClockTick: (_context, engineId) => engineFor(engineId).started.tick(),
      concivClockDrain: (_context, engineId) => engineFor(engineId).started.engine.clock.drain(),
      concivGateStarted: (_context, engineId, gateId) => gateFor(engineId, gateId).started,
      concivGateRelease: async (_context, engineId, gateId) => {
        const gate = gateFor(engineId, gateId)
        delete engineFor(engineId).gates[gateId]
        await gate.release()
      },
      concivSend: (_context, engineId, sessionId, text) => sessionFor(engineId, sessionId).send(text),
      concivApprove: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).approve(),
      concivStop: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).stop(),
      concivRequests: (_context, engineId) => engineFor(engineId).started.engine.requests(),
      concivOpened: (_context, engineId) => engineFor(engineId).started.engine.opened(),
      concivToolCall: (_context, engineId, sessionId, name, input) =>
        sessionFor(engineId, sessionId).tool(name).call(input),
      concivToolFailure: (_context, engineId, sessionId, name, input) =>
        sessionFor(engineId, sessionId).tool(name).failure(input),
      concivOutsideDescribe: (_context, engineId, agent) =>
        engineFor(engineId).started.engine.outside(agent).describe(),
      concivOutsideDiscover: (_context, engineId, agent, toolNames) =>
        engineFor(engineId).started.engine.outside(agent).discover(toolNames),
      concivOutsideCall: (_context, engineId, agent, name, input) =>
        engineFor(engineId).started.engine.outside(agent).call(name, input),
      concivReply: (_context, engineId, replies) =>
        engineFor(engineId).started.engine.reply(...replies.map((reply) => (reply === 'hang' ? hang() : reply))),
      concivStale: (_context, engineId, staleness) => engineFor(engineId).started.engine.stale(staleness),
      concivVersion: (_context, engineId, version) => engineFor(engineId).started.engine.version(version),
      concivWrite: (_context, engineId, path, content) => engineFor(engineId).started.engine.write(path, content),
      concivCommit: (_context, engineId, message) => engineFor(engineId).started.engine.commit(message),
    },
    plugin: {
      name: 'conciv:test-browser-engines',
      configureVitest({vitest}) {
        vitest.onClose(() => stopWhere(() => true))
      },
    },
  }
}

export function concivEngines(): Plugin {
  const engines = browserEngines()
  return {
    ...engines.plugin,
    config: () => ({test: {browser: {commands: engines.commands}}, optimizeDeps: {include: PREBUNDLED}}),
  }
}
