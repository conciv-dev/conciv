import {readFileSync} from 'node:fs'
import {glob, readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {extname, join, matchesGlob} from 'node:path'
import type {Plugin, UserConfig} from 'vite'
import type {TestProjectInlineConfiguration} from 'vitest/config'
import {
  BROWSER_TESTS,
  browserProject as plainBrowserProject,
  domProject,
  kitDefaults,
  nodeProject,
  solidPlugins,
  VIEWPORT,
  type BrowserName,
} from '@internal/vitest-config/test-config'
import {POLL_TIMEOUT_MS} from '@internal/vitest-config'
import type {BrowserCommandContext} from 'vitest/node'
import type {Page} from 'playwright'
import {createGenerator} from 'unocss'
import {presetConciv} from '@conciv/uno-preset'
import {z} from 'zod'
import {pluginDirectory} from './plugin-directory.js'
import type {PageCommands} from './browser-commands.js'
import {engineCommands} from './engine-commands.js'

const KIT_DIRECTORY = import.meta.dirname
const KIT_EXTENSION = extname(import.meta.filename)
const NODE_ONLY_CONDITIONS = ['browser', 'solid']
const SOLID_INJECTED_JEST_DOM = '@testing-library/jest-dom/vitest'
const PERF_TESTS = ['src/**/*.perf.test.ts', 'src/**/*.perf.test.tsx']

const TESTING_LIBRARIES = ['@solidjs/testing-library', '@testing-library/user-event']

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

const GENERATED_SHEET = 'virtual:conciv-test.css'
const RESOLVED_SHEET = `\0${GENERATED_SHEET}`
const PACKAGE_SOURCES = ['src/**/*.{ts,tsx}', '!src/**/*.{test,spec,stories}.*']

async function scannedFiles(patterns: readonly string[]): Promise<string[]> {
  const included = patterns.filter((pattern) => !pattern.startsWith('!'))
  const excluded = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))
  const files: string[] = []
  for await (const file of glob(included)) files.push(file)
  return [...new Set(files)].filter((file) => !excluded.some((pattern) => matchesGlob(file, pattern)))
}

function sourcePatterns(directory: string): string[] {
  return PACKAGE_SOURCES.map((pattern) =>
    pattern.startsWith('!') ? `!${join(directory, pattern.slice(1))}` : join(directory, pattern),
  )
}

async function generateTestSheet(directories: readonly string[]): Promise<string> {
  const packageSources = [...new Set(directories)].flatMap((directory) => sourcePatterns(directory))
  const generator = await createGenerator({presets: [presetConciv()]})
  const tokens = new Set<string>()
  const files = await scannedFiles([join(KIT_DIRECTORY, `**/*${KIT_EXTENSION}`), ...packageSources])
  await Promise.all(files.map(async (file) => generator.applyExtractors(await readFile(file, 'utf8'), file, tokens)))
  const {css} = await generator.generate(tokens)
  return css
}

function generatedStyles(testable: readonly TestablePlugin[]): Plugin {
  let sheet: Promise<string> | undefined
  return {
    name: 'conciv:test-generated-styles',
    resolveId: (source) => (source === GENERATED_SHEET ? RESOLVED_SHEET : null),
    load(id) {
      if (id !== RESOLVED_SHEET) return null
      sheet ??= generateTestSheet([process.cwd(), ...testable.map((plugin) => plugin.directory)])
      return sheet
    },
  }
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

const TEST_PLUGINS = 'virtual:conciv-test-plugins'

const ManifestSchema = z.object({
  name: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

type Manifest = z.infer<typeof ManifestSchema>

function readManifest(directory: string): Manifest {
  return ManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')))
}

const PluginManifestSchema = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text)
    } catch {
      context.addIssue({code: 'custom', message: 'the package.json is not JSON'})
      return z.NEVER
    }
  })
  .pipe(
    z.object({
      name: z.string(),
      keywords: z.array(z.string()).refine((keywords) => keywords.includes('conciv-plugin')),
      exports: z.record(z.string(), z.unknown()).catch({}),
    }),
  )

const ENGINE_SUBPATHS = ['./server', './plugin-experimental']

type TestablePlugin = {name: string; id: string; directory: string; engine: boolean}

function testablePlugin(name: string): TestablePlugin[] {
  const directory = pluginDirectory(name)
  const manifest = PluginManifestSchema.safeParse(readFileSync(join(directory, 'package.json'), 'utf8'))
  if (!manifest.success) return []
  const engine = ENGINE_SUBPATHS.some((subpath) => Object.hasOwn(manifest.data.exports, subpath))
  return [{name, id: manifest.data.name, directory, engine}]
}

function testablePlugins(): TestablePlugin[] {
  const own = readManifest(process.cwd())
  const names = [own.name ?? [], Object.keys({...own.dependencies, ...own.devDependencies})].flat()
  return names.flatMap((name) => testablePlugin(name))
}

const PLUGIN_SPECIFIER = /^virtual:conciv-test-plugin\/(\d+)$/

function pluginAt(testable: readonly TestablePlugin[], index: number): TestablePlugin {
  const plugin = Number.isSafeInteger(index) ? testable[index] : undefined
  if (plugin === undefined || plugin.engine) throw new Error(`no window plugin at index ${index}`)
  return plugin
}

function pluginsByName(testable: readonly TestablePlugin[]): Plugin {
  const resolved = `\0${TEST_PLUGINS}`
  return {
    name: 'conciv:test-plugins',
    resolveId(id) {
      if (id === TEST_PLUGINS) return resolved
      const index = PLUGIN_SPECIFIER.exec(id)?.[1]
      if (index === undefined) return undefined
      return this.resolve(pluginAt(testable, Number(index)).directory, undefined, {skipSelf: true})
    },
    load: (id) => {
      if (id !== resolved) return undefined
      const loaders = testable.map((plugin, index) => {
        if (plugin.engine) return 'undefined'
        if (!Number.isSafeInteger(index)) throw new Error(`the plugin index ${index} is not an integer`)
        return `() => import('virtual:conciv-test-plugin/${index}')`
      })
      return `export const loaders = [${loaders.join(', ')}]`
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

function testProjects(authorPlugins: UserConfig['plugins']): TestProjectInlineConfiguration[] {
  const testable = testablePlugins()
  const styles = generatedStyles(testable)
  const solid = solidPlugins(authorPlugins)
  const byName = pluginsByName(testable)
  const provide = {
    concivPollTimeoutMs: POLL_TIMEOUT_MS,
    concivViewport: VIEWPORT,
    concivTestPlugins: testable.map(({name, id, engine}) => ({name, id, kind: engine ? 'engine' : 'host'}) as const),
  }
  const browserProject = (name: string, include: string[], browsers: BrowserName[]): TestProjectInlineConfiguration =>
    plainBrowserProject(name, include, browsers, {
      plugins: [styles, ...solid, byName],
      server: {fs: {strict: false}},
      optimizeDeps: {
        rolldownOptions: {plugins: [byName]},
        include: installedTestingLibraries(),
      },
      test: {
        setupFiles: [join(KIT_DIRECTORY, `browser-setup${KIT_EXTENSION}`)],
        provide,
        browser: {commands: {...pageErrorCommands(), ...engineCommands()}},
      },
    })
  return [
    nodeProject({plugins: [engineModulesInNode()]}),
    domProject({
      plugins: [...solid, engineModulesInNode()],
      test: {setupFiles: [join(KIT_DIRECTORY, `happy-dom-setup${KIT_EXTENSION}`)], provide},
    }),
    browserProject('browser', BROWSER_TESTS, ['chromium']),
    browserProject('perf', PERF_TESTS, ['chromium', 'firefox']),
  ]
}

const KIT_PROJECTS = ['node', 'happy-dom', 'browser', 'perf']

const ProjectFilterSchema = z.object({project: z.union([z.string(), z.array(z.string())]).optional()})

function selectedProjects(projects: TestProjectInlineConfiguration[], test: unknown): TestProjectInlineConfiguration[] {
  const names = [ProjectFilterSchema.safeParse(test).data?.project ?? []].flat()
  if (names.length === 0) return projects.filter((project) => project.test?.name !== 'perf')
  if (!names.every((name) => KIT_PROJECTS.includes(name))) return projects
  return projects.filter((project) => typeof project.test?.name === 'string' && names.includes(project.test.name))
}

export function kitTestConfig(config: UserConfig): UserConfig {
  const defaults = kitDefaults(config.test)
  if (config.test?.name !== undefined) return {test: defaults}
  return {test: {...defaults, projects: selectedProjects(testProjects(config.plugins), config.test)}}
}
