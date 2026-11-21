import {join} from 'node:path'
import {createRouterClient, type RouterClient} from '@orpc/server'
import {test as base, vi, type TestAPI} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {start, type Engine} from '../src/start.js'
import {readEngineRouter} from '../src/api/rpc/engine-router.js'
import {createTtySessions, type TtySessions} from '../src/pty/pty-sessions.js'
import {createSettingsStorage, type SettingsStorages} from '../src/settings/settings-storage.js'

type SettingsStorage = ReturnType<typeof createSettingsStorage>

type EngineClient = RouterClient<ReturnType<typeof readEngineRouter>>

function startOn(root: string): Promise<Engine> {
  return start({
    options: {stateRoot: root},
    root,
    homeDir: join(root, 'home'),
    devEndpointDir: join(root, 'dev-endpoint'),
    launchEditor: () => {},
    print: () => {},
  })
}

function clientFor(engine: Engine): EngineClient {
  return createRouterClient(readEngineRouter(engine), {
    context: {origin: `http://127.0.0.1:${engine.port}`, callerOrigin: null, headers: {}},
  })
}

type EngineFixtures = {
  engine: Engine
  client: EngineClient
  launch: (root: string) => Promise<EngineClient>
  fakeTimers: (config: Parameters<typeof vi.useFakeTimers>[0]) => void
  ttySessions: (options: Parameters<typeof createTtySessions>[0]) => TtySessions
  settingsStorage: (storages: SettingsStorages) => SettingsStorage
}

export const test: TestAPI<EngineFixtures> = base.extend<EngineFixtures>({
  engine: async ({task: _task}, use) => {
    const engine = await startOn(tempDir('engine-'))
    await use(engine)
    await engine.stop()
  },
  client: async ({engine}, use) => {
    await use(clientFor(engine))
  },
  launch: async ({task: _task}, use) => {
    const running: Engine[] = []
    await use(async (root) => {
      await Promise.all(running.splice(0).map((engine) => engine.stop()))
      const engine = await startOn(root)
      running.push(engine)
      return clientFor(engine)
    })
    await Promise.all(running.map((engine) => engine.stop()))
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
      const storage = createSettingsStorage(storages)
      opened.push(storage)
      return storage
    })
    await Promise.all(opened.map((storage) => storage.close()))
  },
})
