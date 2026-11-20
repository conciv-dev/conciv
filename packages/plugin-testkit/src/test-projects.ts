import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import type {Plugin} from 'vite'
import {configDefaults, type TestProjectInlineConfiguration} from 'vitest/config'
import type {BrowserCommandContext} from 'vitest/node'
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
import {startEngine, type EngineSession, type StartedEngine} from './engine.js'
import {disposeAll} from './dispose.js'
import type {EngineCommands} from './browser-commands.js'

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
const PAGE_DEPENDENCIES_TO_INLINE = [/solid/, /@ark-ui/, /@zag-js/, /lucide/, /packages\/(core|tools)\/dist\/cards/]
const ENGINE_IN_NODE = [/plugin-testkit\/dist\/(node|engine-[\w-]+)\.js$/]
const BROWSER_PREBUNDLED = [
  ...TANSTACK_AI_SOLID_DEPS,
  '@conciv/mascot > gsap',
  '@conciv/mascot > gsap/MotionPathPlugin',
  '@tanstack/hotkeys',
  '@tanstack/solid-hotkeys',
  '@solid-primitives/mutation-observer',
  'semver/functions/lt',
  'semver/functions/valid',
]

function appUnoConfig(): string {
  return join(dirname(createRequire(import.meta.url).resolve('@conciv/app/package.json')), 'uno.config.ts')
}

function engineModulesInNode(): Plugin {
  return {
    name: 'conciv:test-engine-conditions',
    enforce: 'post',
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
        engines[id] = {started, sessions: {[started.engine.session.id]: started.engine.session}, testPath, scope}
        return {id, sessionId: started.engine.session.id, address: started.address}
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
      concivSend: (_context, engineId, sessionId, text) => sessionFor(engineId, sessionId).send(text),
      concivApprove: (_context, engineId, sessionId) => sessionFor(engineId, sessionId).approve(),
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

export function testProjects(): TestProjectInlineConfiguration[] {
  const uno = appUnoConfig()
  const engines = browserEngines()
  const provide = {concivPollTimeoutMs: POLL_TIMEOUT_MS}
  const page = ciTestSolidBrowser()
  return [
    {
      extends: true,
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
      optimizeDeps: browserOptimizeDeps(BROWSER_PREBUNDLED),
      test: {
        ...page,
        name: 'browser',
        include: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx'],
        setupFiles: [...page.setupFiles, join(KIT_DIST, 'browser-setup.js')],
        provide,
        browser: {
          enabled: true,
          headless: true,
          provider: playwright(),
          instances: [{browser: 'chromium'}],
          commands: engines.commands,
        },
      },
    },
  ]
}
