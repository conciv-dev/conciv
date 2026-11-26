import {test as base, type TestAPI} from 'vitest'
import {createBackend} from '@conciv/backend-defaults/backend'
import {engineFixture, pluginDirectory, type EngineFixtures} from '@internal/engine-kit'

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

export {pluginDirectory}

export const test: TestAPI<EngineFixtures> = base.extend<EngineFixtures>({createEngine: engineFixture(createBackend)})
