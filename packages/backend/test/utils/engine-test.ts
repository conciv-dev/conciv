import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {test as base, vi, type TestAPI} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {makeBrowserRpcClient, type BrowserRpcClient, type RpcClient} from '@conciv/client'
import type {Engine as KitEngine} from '@conciv/plugin-testkit'
import {createHarnessEngine, type HarnessEngine, type HarnessEngineStart} from '@conciv/simulation'
import type {ConcivConfig} from '@conciv/types/config-types'
import {start} from '../../src/start.js'
import {createTtySessions, type TtySessions} from '../../src/pty/pty-sessions.js'
import {createSettingsStorage, type SettingsStorages} from '../../src/settings/settings-storage.js'

type SettingsStorage = ReturnType<typeof createSettingsStorage>

type Launched = {engine: HarnessEngine; client: RpcClient}

type Running = {engine: HarnessEngine; client: BrowserRpcClient}

async function stopAll(running: Running[]): Promise<void> {
  for (const {client} of running) client.close()
  const stopped = await Promise.allSettled(running.map(({engine}) => engine.stop()))
  const failures = stopped.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []))
  if (failures.length > 0) throw new AggregateError(failures, 'a launched engine did not stop cleanly')
}

type EngineFixtures = {
  engine: HarnessEngine
  launch: (config?: ConcivConfig, options?: HarnessEngineStart) => Promise<Launched>
  connect: (engine: KitEngine) => RpcClient
  untrusted: (engine: KitEngine) => RpcClient
  agentPath: (bins: string[]) => string
  fakeTimers: (config: Parameters<typeof vi.useFakeTimers>[0]) => void
  ttySessions: (options: Parameters<typeof createTtySessions>[0]) => TtySessions
  settingsStorage: (storages: SettingsStorages) => SettingsStorage
}

export const test: TestAPI<EngineFixtures> = base.extend<EngineFixtures>({
  engine: async ({task: _task}, use) => {
    const engine = await createHarnessEngine(start)
    await use(engine)
    await engine.stop()
  },
  launch: async ({task: _task}, use) => {
    const running: Running[] = []
    await use(async (config, options) => {
      const engine = await createHarnessEngine(start, config, options)
      const client = makeBrowserRpcClient(engine.address.apiBase, {token: engine.address.token})
      running.push({engine, client})
      return {engine, client: client.rpc}
    })
    await stopAll(running)
  },
  connect: async ({task: _task}, use) => {
    const clients: BrowserRpcClient[] = []
    await use((engine) => {
      const client = makeBrowserRpcClient(engine.address.apiBase, {
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
    const clients: BrowserRpcClient[] = []
    await use((engine) => {
      const client = makeBrowserRpcClient(new URL(engine.address.apiBase).origin)
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
  ttySessions: async ({task: _task}, use) => {
    const opened: TtySessions[] = []
    await use((options) => {
      const sessions = createTtySessions(options)
      opened.push(sessions)
      return sessions
    })
    for (const sessions of opened) sessions.shutdown()
  },
  settingsStorage: async ({task: _task}, use) => {
    const opened: SettingsStorage[] = []
    await use((storages) => {
      const storage = createSettingsStorage(storages, () => {})
      opened.push(storage)
      return storage
    })
    await Promise.all(opened.map((storage) => storage.close()))
  },
})
