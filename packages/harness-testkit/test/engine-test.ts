import {test as base, type TestAPI} from 'vitest'
import {makeBrowserRpcClient, type BrowserRpcClient, type RpcClient} from '@conciv/contract'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {createHarnessEngine, type HarnessEngine, type HarnessEngineStart} from '../src/harness-engine.js'

type Launched = {engine: HarnessEngine; client: RpcClient}

type EngineFixtures = {
  engine: HarnessEngine
  launch: (config?: ConcivConfig, start?: HarnessEngineStart) => Promise<Launched>
}

type Running = {engine: HarnessEngine; client: BrowserRpcClient}

async function stopAll(running: Running[]): Promise<void> {
  for (const {client} of running) client.close()
  const stopped = await Promise.allSettled(running.map(({engine}) => engine.stop()))
  const failures = stopped.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []))
  if (failures.length > 0) throw new AggregateError(failures, 'a launched engine did not stop cleanly')
}

export const test: TestAPI<EngineFixtures> = base.extend<EngineFixtures>({
  engine: async ({task: _task}, use) => {
    const engine = await createHarnessEngine()
    await use(engine)
    await engine.stop()
  },
  launch: async ({task: _task}, use) => {
    const running: Running[] = []
    await use(async (config, start) => {
      const engine = await createHarnessEngine(config, start)
      const client = makeBrowserRpcClient(engine.address.apiBase)
      running.push({engine, client})
      return {engine, client: client.rpc}
    })
    await stopAll(running)
  },
})
