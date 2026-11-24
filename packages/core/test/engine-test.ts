import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {vi} from 'vitest'
import {test as base} from '../src/testing.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {makeBrowserRpcClient, type BrowserRpcClient, type RpcClient} from '@conciv/contract'
import type {HarnessEngine as KitEngine} from '../src/testing.js'
import {createTtySessions, type TtySessions} from '../src/pty/pty-sessions.js'
import {createSettingsStorage, type SettingsStorages} from '../src/settings/settings-storage.js'

type SettingsStorage = ReturnType<typeof createSettingsStorage>

type EngineFixtures = {
  connect: (engine: KitEngine) => RpcClient
  untrusted: (engine: KitEngine) => RpcClient
  agentPath: (bins: string[]) => string
  fakeTimers: (config: Parameters<typeof vi.useFakeTimers>[0]) => void
  ttySessions: (options: Parameters<typeof createTtySessions>[0]) => TtySessions
  settingsStorage: (storages: SettingsStorages) => SettingsStorage
}

export const test = base.extend<EngineFixtures>({
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
