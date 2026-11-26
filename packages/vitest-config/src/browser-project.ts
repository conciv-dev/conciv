import {existsSync, realpathSync} from 'node:fs'
import {readFile, glob} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join, matchesGlob} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import type {Plugin, UserConfig} from 'vite'
import {configDefaults, type TestProjectInlineConfiguration} from 'vitest/config'
import type {BrowserCommand} from 'vitest/node'
import {playwright} from '@vitest/browser-playwright'
import {createGenerator, type UserConfig as UnoConfig} from 'unocss'
import solidPlugin from 'vite-plugin-solid'
import {z} from 'zod'

const POLL_TIMEOUT_MS = 5_000
const VIEWPORT = {width: 1280, height: 800}
const BROWSER_TESTS = ['test/e2e/**/*.e2e.test.{ts,tsx}']
const PERF_TESTS = ['test/e2e/**/*.perf.e2e.test.{ts,tsx}']
const BROWSER_SETUP = fileURLToPath(new URL('./browser-setup.ts', import.meta.url))
const SHELL = '@internal/frontend-defaults'
const UTILITY_SHEETS = ['virtual:uno.css', '/__uno.css']
const GENERATED_SHEET = '/__conciv-test-uno.css'
const PACKAGE_SOURCES = ['src/**/*.{ts,tsx}', '!src/**/*.{test,spec,stories}.*']

const SHELL_DEPENDENCIES = [
  '@solid-primitives/active-element',
  '@solid-primitives/date',
  '@solid-primitives/keyed',
  '@solid-primitives/mutation-observer',
  '@solid-primitives/resize-observer',
  '@tanstack/hotkeys',
  'semver/functions/lt',
  'semver/functions/valid',
  '@conciv/mascot > gsap',
  '@conciv/mascot > gsap/MotionPathPlugin',
]

type BrowserName = 'chromium' | 'firefox'

const UnoConfigModuleSchema = z.object({
  default: z.custom<UnoConfig>(
    (value) => z.object({content: z.object({filesystem: z.array(z.string())})}).safeParse(value).success,
  ),
})

const ManifestNameSchema = z.object({name: z.string().optional()})

const ENGINE_COMMANDS = '@conciv/backend-test-utils/vitest'

type EngineCommandSet = {
  commands: Record<string, BrowserCommand<never[]>>
  close: () => Promise<void>
}

const EngineCommandsModuleSchema = z.object({
  engineCommands: z.custom<() => EngineCommandSet>((value) => typeof value === 'function'),
})

function engineCommandsFile(): string | undefined {
  try {
    return createRequire(join(process.cwd(), 'package.json')).resolve(ENGINE_COMMANDS)
  } catch {
    return undefined
  }
}

async function engineCommands(): Promise<EngineCommandSet | undefined> {
  const file = engineCommandsFile()
  if (file === undefined) return undefined
  const loaded = EngineCommandsModuleSchema.parse(await import(pathToFileURL(file).href))
  return loaded.engineCommands()
}

function closeEngines(engines: EngineCommandSet | undefined): Plugin {
  return {
    name: 'conciv:test-browser-engines',
    configureVitest({vitest}) {
      vitest.onClose(async () => engines?.close())
    },
  }
}

function packageDirectory(name: string, from: string): string | undefined {
  const linked = join(from, 'node_modules', name)
  return existsSync(linked) ? realpathSync(linked) : undefined
}

const TEST_UTILS = '@internal/frontend-test-utils'

async function shellDirectories(): Promise<{shell: string; carriers: string[]; chain: string[]} | undefined> {
  const own = ManifestNameSchema.parse(JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')))
  const direct = own.name === SHELL ? process.cwd() : packageDirectory(SHELL, process.cwd())
  const utils = packageDirectory(TEST_UTILS, process.cwd())
  const shell = direct ?? (utils === undefined ? undefined : packageDirectory(SHELL, utils))
  if (shell === undefined) return undefined
  const chain = own.name === SHELL ? [] : direct === undefined ? [TEST_UTILS, SHELL] : [SHELL]
  return {shell, carriers: [shell, ...(utils === undefined ? [] : [utils])], chain}
}

function shellDependencies(): Plugin {
  return {
    name: 'conciv:test-shell-dependencies',
    async config() {
      const directories = await shellDirectories()
      if (directories === undefined) return
      return {
        optimizeDeps: {
          include: SHELL_DEPENDENCIES.map((dependency) => [...directories.chain, dependency].join(' > ')),
        },
      }
    },
  }
}

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

async function generateTestSheet(shell: string): Promise<string> {
  const loaded = UnoConfigModuleSchema.parse(await import(pathToFileURL(join(shell, 'uno.config.ts')).href))
  const config = loaded.default
  const generator = await createGenerator(config)
  const tokens = new Set<string>()
  const files = await scannedFiles([...(config.content?.filesystem ?? []), ...sourcePatterns(process.cwd())])
  await Promise.all(files.map(async (file) => generator.applyExtractors(await readFile(file, 'utf8'), file, tokens)))
  const {css} = await generator.generate(tokens)
  return css
}

function generatedStyles(): Plugin {
  const found = shellDirectories()
  const state: {sheet?: Promise<string>} = {}
  return {
    name: 'conciv:test-generated-styles',
    enforce: 'pre',
    resolveId: {
      order: 'pre',
      async handler(source, importer) {
        const [path, query] = source.split('?')
        if (path === GENERATED_SHEET) return source
        if (path === undefined || !UTILITY_SHEETS.includes(path) || importer === undefined) return null
        const directories = await found
        if (!directories?.carriers.some((carrier) => importer.startsWith(join(carrier, 'src')))) return null
        return query === undefined ? GENERATED_SHEET : `${GENERATED_SHEET}?${query}`
      },
    },
    async load(id) {
      if (id.split('?')[0] !== GENERATED_SHEET) return null
      const directories = await found
      if (directories === undefined) return ''
      state.sheet ??= generateTestSheet(directories.shell)
      return state.sheet
    },
  }
}

const NamedPluginSchema = z.object({name: z.string(), apply: z.unknown().optional()})

function hasServingPlugin(option: unknown, name: string): boolean {
  if (Array.isArray(option)) return option.some((item) => hasServingPlugin(item, name))
  const plugin = NamedPluginSchema.safeParse(option).data
  return plugin?.name === name && (plugin.apply === undefined || plugin.apply === 'serve')
}

export async function browserProjects(authorPlugins: UserConfig['plugins']): Promise<TestProjectInlineConfiguration[]> {
  const engines = await engineCommands()
  const styles = generatedStyles()
  const solid = hasServingPlugin(authorPlugins, 'solid') ? [] : [solidPlugin()]
  const project = (
    name: string,
    include: string[],
    exclude: string[],
    browsers: BrowserName[],
  ): TestProjectInlineConfiguration => ({
    extends: true,
    plugins: [styles, shellDependencies(), closeEngines(engines), ...solid],
    server: {fs: {strict: false}},
    test: {
      name,
      include,
      exclude: [...configDefaults.exclude, ...exclude],
      setupFiles: [BROWSER_SETUP],
      provide: {concivPollTimeoutMs: POLL_TIMEOUT_MS, concivViewport: VIEWPORT},
      browser: {
        enabled: true,
        headless: true,
        screenshotFailures: false,
        provider: playwright({contextOptions: {reducedMotion: 'reduce'}}),
        instances: browsers.map((browser) => ({browser})),
        viewport: VIEWPORT,
        commands: engines?.commands,
      },
    },
  })
  return [
    project('browser', BROWSER_TESTS, PERF_TESTS, ['chromium']),
    project('perf', PERF_TESTS, [], ['chromium', 'firefox']),
  ]
}
