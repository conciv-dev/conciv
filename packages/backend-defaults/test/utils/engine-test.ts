import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {test as base, vi, type TestAPI} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import type {EngineClient} from '@conciv/client'
import {
  browserClient,
  createEngine,
  engineFixture,
  type BrowserClient,
  type Engine,
  type EngineFixtures,
  type EngineStart,
  type StartedEngine,
} from '@internal/engine-kit'
import {createBackend} from '../../src/backend.js'
import type {ConcivConfig} from '@conciv/types/config-types'

type Launched = {engine: Engine; client: EngineClient}

type Running = {started: StartedEngine; client: BrowserClient}

async function stopAll(running: Running[]): Promise<void> {
  for (const {client} of running) client.close()
  const stopped = await Promise.allSettled(running.map(({started}) => started.stop()))
  const failures = stopped.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []))
  if (failures.length > 0) throw new AggregateError(failures, 'a launched engine did not stop cleanly')
}

type Fixtures = EngineFixtures & {
  engine: Engine
  launch: (config?: ConcivConfig, options?: EngineStart) => Promise<Launched>
  connect: (engine: Engine) => EngineClient
  untrusted: (engine: Engine) => EngineClient
  agentPath: (bins: string[]) => string
  fakeTimers: (config: Parameters<typeof vi.useFakeTimers>[0]) => void
}

export const test: TestAPI<Fixtures> = base.extend<Fixtures>({
  createEngine: engineFixture(createBackend),
  engine: async ({task: _task}, use) => {
    const started = await createEngine(createBackend)
    await use(started)
    await started.stop()
  },
  launch: async ({task: _task}, use) => {
    const running: Running[] = []
    await use(async (config, options) => {
      const started = await createEngine(createBackend, config, options)
      const client = browserClient(started.address.apiBase, {token: started.address.token})
      running.push({started, client})
      return {engine: started, client: client.rpc}
    })
    await stopAll(running)
  },
  connect: async ({task: _task}, use) => {
    const clients: BrowserClient[] = []
    await use((engine) => {
      const client = browserClient(engine.address.apiBase, {
        token: engine.address.token,
        session: () => engine.session.id,
      })
      clients.push(client)
      return client.rpc
    })
    for (const client of clients) client.close()
  },
  agentPath: async ({task: _task}, use) => {
    await use((bins) => {
      const folder = tempDir('agent-bin-')
      for (const bin of bins) writeFileSync(join(folder, bin), '#!/bin/sh\nexit 0\n', {mode: 0o755})
      return folder
    })
  },
  untrusted: async ({task: _task}, use) => {
    const clients: BrowserClient[] = []
    await use((engine) => {
      const client = browserClient(new URL(engine.address.apiBase).origin)
      clients.push(client)
      return client.rpc
    })
    for (const client of clients) client.close()
  },
  fakeTimers: async ({task: _task}, use) => {
    await use((config) => {
      vi.useFakeTimers(config)
    })
    vi.useRealTimers()
  },
})
