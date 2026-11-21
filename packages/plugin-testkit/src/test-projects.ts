import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import type {Plugin, UserConfig} from 'vite'
import {configDefaults, type TestProjectInlineConfiguration} from 'vitest/config'
import type {BrowserCommandContext} from 'vitest/node'
import type {Page} from 'playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {playwright} from '@vitest/browser-playwright'
import type {TestLLM} from '@conciv/harness-testkit'
import {startEngine, type Engine, type EngineSession, type StartedEngine} from './engine.js'
import {disposeAll} from './dispose.js'
import type {EngineCommands, PageCommands} from './browser-commands.js'

type EngineCommandHandlers = {
  [Name in keyof EngineCommands]: (
    context: BrowserCommandContext,
    ...args: Parameters<EngineCommands[Name]>
  ) => ReturnType<EngineCommands[Name]>
}

const KIT_DIST = import.meta.dirname
const BROWSER_ENTRY = /^@conciv\/plugin-testkit\/browser$/
const NODE_ENTRY = /^@conciv\/plugin-testkit\/node$/
const NODE_ONLY_CONDITIONS = ['browser', 'solid']
const SOLID_INJECTED_JEST_DOM = '@testing-library/jest-dom/vitest'
const PAGE_DEPENDENCIES_TO_INLINE = [/solid/, /@ark-ui/, /@zag-js/, /lucide/, /packages\/(core|tools)\/dist\/cards/]
const ENGINE_IN_NODE = [/plugin-testkit\/dist\/(node|engine-[\w-]+)\.js$/]
const APP_FROM_KIT = '@conciv/plugin-testkit > @conciv/app'
const TEST_TIMEOUT_MS = 30_000
const HOOK_TIMEOUT_MS = 30_000
const POLL_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 50
const BROWSER_PREBUNDLED = [
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client',
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client/byok',
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client/devtools',
  '@conciv/mascot > gsap',
  '@conciv/mascot > gsap/MotionPathPlugin',
  '@tanstack/hotkeys',
  '@tanstack/solid-hotkeys',
  '@solid-primitives/mutation-observer',
  'semver/functions/lt',
  'semver/functions/valid',
].map((dependency) => `${APP_FROM_KIT} > ${dependency}`)

const TESTING_LIBRARIES = ['@testing-library/user-event']

function installedTestingLibraries(): string[] {
  const packageRequire = createRequire(join(process.cwd(), 'package.json'))
  return TESTING_LIBRARIES.filter((library) => {
    try {
      packageRequire.resolve(library)
      return true
    } catch {
      return false
    }
  })
}

function workerCap(): number | undefined {
  const cap = Number(process.env.VITEST_MAX_FORKS)
  return Number.isInteger(cap) && cap >= 1 ? cap : undefined
}

type AuthorTest = NonNullable<UserConfig['test']>

function pollDefaults(expect: AuthorTest['expect'] = {}): {timeout: number; interval: number} {
  return {timeout: expect.poll?.timeout ?? POLL_TIMEOUT_MS, interval: expect.poll?.interval ?? POLL_INTERVAL_MS}
}

function kitDefaults(test: AuthorTest = {}): AuthorTest {
  return {
    testTimeout: test.testTimeout ?? TEST_TIMEOUT_MS,
    hookTimeout: test.hookTimeout ?? HOOK_TIMEOUT_MS,
    expect: {poll: pollDefaults(test.expect)},
    maxWorkers: test.maxWorkers ?? workerCap(),
  }
}

function appUnoConfig(): string {
  return join(dirname(createRequire(import.meta.url).resolve('@conciv/app/package.json')), 'uno.config.ts')
}

function engineModulesInNode(): Plugin {
  return {
    name: 'conciv:test-engine-conditions',
    enforce: 'post',
    config(config) {
      const setupFiles = config.test?.setupFiles
      if (!Array.isArray(setupFiles)) return
      const kept = setupFiles.filter((file) => file !== SOLID_INJECTED_JEST_DOM)
      setupFiles.splice(0, setupFiles.length, ...kept)
    },
    configResolved(config) {
      const conditions = config.ssr.resolve?.conditions
      if (!conditions) return
      const kept = conditions.filter((condition) => !NODE_ONLY_CONDITIONS.includes(condition))
      conditions.splice(0, conditions.length, ...kept)
    },
  }
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
      concivCreateEngine: async ({testPath}, config, options, scope) => {
        const started = await startEngine(config, options)
        counter.next += 1
        const id = String(counter.next)
        engines[id] = {
          started,
          sessions: {[started.engine.session.id]: started.engine.session},
          gates: {},
          waits: {},
          testPath,
          scope,
        }
        return {id, sessionId: started.engine.session.id, address: started.engine.address, root: started.engine.root}
      },
      concivStopEngine: (_context, engineId) => stop(engineId),
      concivStopFileEngines: ({testPath}) =>
        stopWhere((engine) => engine.testPath === testPath && engine.scope === 'file'),
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
      concivEvent: async (_context, engineId, type) => {
        const engine = engineFor(engineId)
        counter.next += 1
        const waitId = String(counter.next)
        engine.waits[waitId] = await engine.started.engine.event(type)
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
      concivReply: (_context, engineId, responses) => engineFor(engineId).started.engine.reply(...responses),
      concivStale: (_context, engineId, staleness) => engineFor(engineId).started.engine.stale(staleness),
      concivVersion: (_context, engineId, version) => engineFor(engineId).started.engine.version(version),
      concivWrite: (_context, engineId, path, content) => engineFor(engineId).started.engine.write(path, content),
    },
    plugin: {
      name: 'conciv:test-browser-engines',
      configureVitest({vitest}) {
        vitest.onClose(() => stopWhere(() => true))
      },
    },
  }
}

type PageCommandHandlers = {
  [Name in keyof PageCommands]: (context: BrowserCommandContext) => ReturnType<PageCommands[Name]>
}

type PageWatch = {page: Page; errors: string[]}

function pageErrorCommands(): PageCommandHandlers {
  const watches: Record<string, PageWatch> = {}
  return {
    concivWatchPage: async ({sessionId, page}) => {
      const watched = watches[sessionId]
      if (watched?.page === page) {
        watched.errors.splice(0)
        return
      }
      const watch: PageWatch = {page, errors: []}
      watches[sessionId] = watch
      page.on('console', (message) => {
        if (message.type() === 'error') watch.errors.push(message.text())
      })
      page.on('pageerror', (error) => watch.errors.push(error.stack ?? error.message))
      page.on('response', (response) => {
        if (response.status() >= 400) watch.errors.push(`${response.status()} ${response.url()}`)
      })
    },
    concivPageErrors: async ({sessionId, page}) => {
      await page.evaluate(() => undefined)
      return [...(watches[sessionId]?.errors ?? [])]
    },
  }
}

function testProjects(): TestProjectInlineConfiguration[] {
  const uno = appUnoConfig()
  const engines = browserEngines()
  const provide = {concivPollTimeoutMs: POLL_TIMEOUT_MS}
  return [
    {
      extends: true,
      plugins: [engineModulesInNode()],
      test: {
        name: 'node',
        environment: 'node',
        include: ['src/**/*.test.ts'],
        setupFiles: [join(KIT_DIST, 'node-setup.js')],
        exclude: [...configDefaults.exclude, '**/*.dom.test.*', '**/*.browser.test.*'],
      },
    },
    {
      extends: true,
      plugins: [UnoCSS({configFile: uno}), solidPlugin(), engineModulesInNode()],
      server: {fs: {strict: false}},
      resolve: {alias: [{find: BROWSER_ENTRY, replacement: join(KIT_DIST, 'happy-dom.js')}]},
      test: {
        name: 'happy-dom',
        isolate: false,
        include: ['src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx'],
        environment: join(KIT_DIST, 'dom-environment.js'),
        environmentOptions: {happyDOM: {width: 1280, height: 800}},
        setupFiles: [join(KIT_DIST, 'node-setup.js'), join(KIT_DIST, 'happy-dom-setup.js')],
        provide,
        server: {deps: {inline: PAGE_DEPENDENCIES_TO_INLINE, external: ENGINE_IN_NODE}},
      },
    },
    {
      extends: true,
      plugins: [UnoCSS({configFile: uno}), solidPlugin(), engines.plugin],
      server: {fs: {strict: false}},
      resolve: {alias: [{find: NODE_ENTRY, replacement: join(KIT_DIST, 'browser-engine.js')}]},
      optimizeDeps: {include: [...BROWSER_PREBUNDLED, ...installedTestingLibraries()]},
      test: {
        name: 'browser',
        include: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx'],
        setupFiles: [join(KIT_DIST, 'browser-setup.js'), join(KIT_DIST, 'browser.js')],
        provide,
        browser: {
          enabled: true,
          headless: true,
          provider: playwright(),
          instances: [{browser: 'chromium'}],
          commands: {...engines.commands, ...pageErrorCommands()},
        },
      },
    },
  ]
}

export function kitTestConfig(config: UserConfig): UserConfig {
  const defaults = kitDefaults(config.test)
  if (config.test?.name !== undefined) return {test: defaults}
  return {test: {...defaults, projects: testProjects()}}
}
