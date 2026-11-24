import {
  createHarnessEngine,
  type HarnessEngine,
  type HarnessEngineAddress,
  type EngineStart,
  type HarnessEngineClock,
  type HarnessEngineSession,
  type HarnessEngineSetting,
  type HarnessEngineToolFailure,
} from '@conciv/core/testing'
import type {ConcivConfig} from '@conciv/protocol/config-types'

export type EngineSetting = HarnessEngineSetting

export type {EngineStart}

export type ToolFailure = HarnessEngineToolFailure

export type EngineSession = HarnessEngineSession

export type EngineClock = Omit<HarnessEngineClock, 'tick'>

export type Engine = Omit<HarnessEngine, 'stop' | 'clock'> & {clock: EngineClock}

export type EngineAddress = HarnessEngineAddress

export type StartedEngine = {engine: Engine; stop: () => Promise<void>; tick: () => Promise<void>}

export async function startEngine(config: ConcivConfig = {}, options: EngineStart = {}): Promise<StartedEngine> {
  const {stop, clock, ...engine} = await createHarnessEngine(config, options)
  return {engine: {...engine, clock: {advance: clock.advance, drain: clock.drain}}, stop, tick: clock.tick}
}
