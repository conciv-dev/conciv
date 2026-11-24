import {AsyncLocalStorage} from 'node:async_hooks'
import {aroundEach, type TestContext} from 'vitest'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {createHarnessEngine, type HarnessEngine, type HarnessEngineStart} from '../src/testing.js'

const runningTests = new AsyncLocalStorage<TestContext['onTestFinished']>()

aroundEach((runTest, {onTestFinished}) => runningTests.run(onTestFinished, runTest))

export async function createEngine(
  config: ConcivConfig = {},
  options: HarnessEngineStart = {},
): Promise<HarnessEngine> {
  const onTestFinished = runningTests.getStore()
  if (onTestFinished === undefined) throw new Error('createEngine starts an engine inside a test, which stops it')
  const engine = await createHarnessEngine(config, options)
  onTestFinished(() => engine.stop())
  return engine
}
