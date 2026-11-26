import {once} from 'node:events'
import {createServer} from 'node:http'
import {test as base, vi, type TestAPI} from 'vitest'
import {createTtySessions, type TtySessions} from '../../src/engine/pty/pty-sessions.js'
import {createSettingsStorage, type SettingsStorages} from '../../src/engine/settings/settings-storage.js'
import {makeMaker} from '@conciv/protocol/schema/identifier'

type SettingsStorage = ReturnType<typeof createSettingsStorage>

type EnginePartFixtures = {
  fakeTimers: (config: Parameters<typeof vi.useFakeTimers>[0]) => void
  ttySessions: (options: Omit<Parameters<typeof createTtySessions>[0], 'ids'>) => TtySessions
  settingsStorage: (storages: SettingsStorages) => SettingsStorage
  otlpEndpoint: string
}

export const test: TestAPI<EnginePartFixtures> = base.extend<EnginePartFixtures>({
  fakeTimers: async ({task: _task}, use) => {
    await use((config) => {
      vi.useFakeTimers(config)
    })
    vi.useRealTimers()
  },
  ttySessions: async ({task: _task}, use) => {
    const opened: TtySessions[] = []
    const ids = makeMaker()
    await use((options) => {
      const sessions = createTtySessions({...options, ids})
      opened.push(sessions)
      return sessions
    })
    for (const sessions of opened) sessions.shutdown()
  },
  settingsStorage: async ({task: _task}, use) => {
    const opened: SettingsStorage[] = []
    const ids = makeMaker()
    await use((storages) => {
      const storage = createSettingsStorage(storages, () => {}, ids)
      opened.push(storage)
      return storage
    })
    await Promise.all(opened.map((storage) => storage.close()))
  },
  otlpEndpoint: async ({task: _task}, use) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, {'content-type': 'application/json'}).end('{}')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    await use(`http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  },
})
