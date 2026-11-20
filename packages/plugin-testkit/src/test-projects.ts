import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import type {Plugin} from 'vite'
import {configDefaults, type TestProjectInlineConfiguration} from 'vitest/config'
import type {BrowserCommandContext} from 'vitest/node'
import type {Page} from 'playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {playwright} from '@vitest/browser-playwright'
import {
  POLL_TIMEOUT_MS,
  TANSTACK_AI_SOLID_DEPS,
  browserOptimizeDeps,
  ciTest,
  ciTestSolidBrowser,
} from '@conciv/vitest-config'
import type {TestLLM} from '@conciv/harness-testkit'
import {startEngine, type EngineSession, type StartedEngine} from './engine.js'
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
const BROWSER_PREBUNDLED = [
  ...TANSTACK_AI_SOLID_DEPS,
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
  gates: Record<string, TestLLM.Gate>
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
  const sessionFor = (engineId: string, sessionId: string): EngineSession =>
    engineFor(engineId).started.engine.sessionById(sessionId)
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
      concivCreateEngine: async ({testPath}, options, scope) => {
        const started = await startEngine(options)
        counter.next += 1
        const id = String(counter.next)
        engines[id] = {started, gates: {}, testPath, scope}
        return {id, sessionId: started.engine.session.id, address: started.engine.address}
      },
      concivStopEngine: (_context, engineId) => stop(engineId),
      concivStopFileEngines: ({testPath}) =>
        stopWhere((engine) => engine.testPath === testPath && engine.scope === 'file'),
      concivNewSession: async (_context, engineId, title) =>
        (await engineFor(engineId).started.engine.newSession(title)).id,
      concivSessions: (_context, engineId) => engineFor(engineId).started.engine.sessions(),
      concivSetting: (_context, engineId, setting) => engineFor(engineId).started.engine.setting(setting),
      concivGate: async (_context, engineId) => {
        const engine = engineFor(engineId)
        counter.next += 1
        const gateId = String(counter.next)
        engine.gates[gateId] = await engine.started.engine.gate()
        return gateId
      },
      concivGateStarted: (_context, engineId, gateId) => gateFor(engineId, gateId).started,
      concivGateRelease: async (_context, engineId, gateId) => {
        const gate = gateFor(engineId, gateId)
        delete engineFor(engineId).gates[gateId]
        await gate.release()
      },
      concivSend: (_context, engineId, sessionId, text) => sessionFor(engineId, sessionId).send(text),
      concivApprove: (_context, engineId, sessionId, reply) => sessionFor(engineId, sessionId).approve(reply),
      concivStop: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).stop(),
      concivMessages: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).messages(),
      concivRename: (_context, engineId, sessionId, title) => sessionFor(engineId, sessionId).rename(title),
      concivCompact: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).compact(),
      concivModel: (_context, engineId, sessionId, model) => sessionFor(engineId, sessionId).model(model),
      concivEffort: (_context, engineId, sessionId, effort) => sessionFor(engineId, sessionId).effort(effort),
      concivRemove: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).remove(),
      concivRequests: (_context, engineId) => engineFor(engineId).started.engine.requests(),
      concivPush: (_context, engineId, replies) => engineFor(engineId).started.engine.push(...replies),
      concivAlways: (_context, engineId, reply) => engineFor(engineId).started.engine.always(reply),
      concivWait: (_context, engineId, count) => engineFor(engineId).started.engine.wait(count),
      concivReadFile: (_context, engineId, path) => engineFor(engineId).started.engine.files.read(path),
      concivWriteFile: (_context, engineId, path, text) => engineFor(engineId).started.engine.files.write(path, text),
      concivAnswer: (_context, engineId, sessionId, value) => sessionFor(engineId, sessionId).answer(value),
      concivSwitchHarness: (_context, engineId, sessionId, harnessId, model) =>
        sessionFor(engineId, sessionId).switchHarness(harnessId, model),
      concivToolCall: (_context, engineId, sessionId, name, input) =>
        sessionFor(engineId, sessionId).tool(name).call(input),
      concivToolFailure: (_context, engineId, sessionId, name, input) =>
        sessionFor(engineId, sessionId).tool(name).failure(input),
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

export function testProjects(): TestProjectInlineConfiguration[] {
  const uno = appUnoConfig()
  const engines = browserEngines()
  const provide = {concivPollTimeoutMs: POLL_TIMEOUT_MS}
  const page = ciTestSolidBrowser()
  return [
    {
      extends: true,
      plugins: [engineModulesInNode()],
      test: {
        ...ciTest(),
        name: 'node',
        environment: 'node',
        include: ['src/**/*.test.ts'],
        setupFiles: [...ciTest().setupFiles, join(KIT_DIST, 'node-setup.js')],
        exclude: [...configDefaults.exclude, '**/*.dom.test.*', '**/*.browser.test.*'],
      },
    },
    {
      extends: true,
      plugins: [UnoCSS({configFile: uno}), solidPlugin(), engineModulesInNode()],
      server: {fs: {strict: false}},
      resolve: {alias: [{find: BROWSER_ENTRY, replacement: join(KIT_DIST, 'happy-dom.js')}]},
      test: {
        ...page,
        name: 'happy-dom',
        isolate: false,
        include: ['src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx'],
        environment: join(KIT_DIST, 'dom-environment.js'),
        environmentOptions: {happyDOM: {width: 1280, height: 800}},
        setupFiles: [...page.setupFiles, join(KIT_DIST, 'node-setup.js'), join(KIT_DIST, 'happy-dom-setup.js')],
        provide,
        server: {deps: {inline: PAGE_DEPENDENCIES_TO_INLINE, external: ENGINE_IN_NODE}},
      },
    },
    {
      extends: true,
      plugins: [UnoCSS({configFile: uno}), solidPlugin(), engines.plugin],
      server: {fs: {strict: false}},
      resolve: {alias: [{find: NODE_ENTRY, replacement: join(KIT_DIST, 'browser-engine.js')}]},
      optimizeDeps: browserOptimizeDeps([...BROWSER_PREBUNDLED, ...installedTestingLibraries()]),
      test: {
        ...page,
        name: 'browser',
        include: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx'],
        setupFiles: [...page.setupFiles, join(KIT_DIST, 'browser-setup.js'), join(KIT_DIST, 'browser.js')],
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
