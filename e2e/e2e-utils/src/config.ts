import {delimiter, dirname, join} from 'node:path'
import {defineConfig, devices, type PlaywrightTestConfig, type ReporterDescription} from '@playwright/test'
import getPort from 'get-port'
import {z} from 'zod'
import {e2ePluginCopyDir, e2eStateDir} from './dev-endpoint.js'

export type E2EApp =
  | 'vite-vanilla'
  | 'vite-react'
  | 'vite-solid'
  | 'svelte'
  | 'solid-start'
  | 'tanstack-start'
  | 'nextjs'
  | 'astro'
  | 'vite-react-component'
  | 'nextjs-component'
  | 'vite-preact-component'
  | 'vite-solid-component'
  | 'tanstack-start-redact'
  | 'vite-react-packed'

const HARNESSES = ['claude', 'codex', 'gemini-cli', 'opencode', 'pi'] as const

export type HarnessApp = (typeof HARNESSES)[number]

const PACKED_SPECS = '**/packed-*.spec.ts'

const VITE_COLD_START = process.env.CI ? '--force' : ''

const PORT_SLOT = '{port}'

const DEFAULTS = {
  timeout: 30_000,
  expect: {timeout: 10_000},
  use: {reducedMotion: 'reduce', trace: 'retain-on-failure'},
} satisfies PlaywrightTestConfig

const AppServerSchema = z.object({
  dir: z.string(),
  argv: z.array(z.string()),
  concivHome: z.string(),
  env: z.record(z.string(), z.string()),
})

export type AppServer = {
  dir: string
  concivHome: string
  env: Record<string, string>
  command: (port: number) => {file: string; args: string[]}
}

const BLOCK_ALL_COOKIES_AND_SITE_DATA = 2

const BROWSER_SETTING_PROJECTS = {
  'storage-refused': {
    name: 'firefox-storage-refused',
    testMatch: '**/storage-refused.spec.ts',
    use: {
      ...devices['Desktop Firefox'],
      launchOptions: {firefoxUserPrefs: {'network.cookie.cookieBehavior': BLOCK_ALL_COOKIES_AND_SITE_DATA}},
    },
  },
  'pop-out-refused': {
    name: 'chromium-pop-out-refused',
    testMatch: '**/pop-out-refused.spec.ts',
    use: {...devices['Desktop Chrome'], launchOptions: {args: ['--block-new-web-contents']}},
  },
}

export type BrowserSetting = keyof typeof BROWSER_SETTING_PROJECTS

function appProjects(settings: readonly BrowserSetting[], metadata: Record<string, unknown>) {
  const chromium = {
    name: 'chromium',
    testIgnore: [PACKED_SPECS, ...Object.values(BROWSER_SETTING_PROJECTS).map((project) => project.testMatch)],
    use: {...devices['Desktop Chrome']},
  }
  return [chromium, ...settings.map((setting) => BROWSER_SETTING_PROJECTS[setting])].map((project) => ({
    ...project,
    metadata,
  }))
}

function reporters(configDir: string, appStateFolders: string[], runFolders: string[] = []): ReporterDescription[] {
  const cleanup: ReporterDescription = [
    join(import.meta.dirname, 'state-cleanup-reporter.ts'),
    {
      stateDir: e2eStateDir(configDir),
      appStateFolders: [...appStateFolders.map((folder) => join(configDir, folder)), ...runFolders],
    },
  ]
  if (!process.env.GITHUB_ACTIONS) return [['line'], cleanup]
  return [['line'], ['json', {outputFile: 'test-results.json'}], cleanup]
}

function legacyStateDir(configDir: string): string {
  return join(configDir, '.conciv-e2e')
}

export function e2eConfigDir(configFile: string | undefined): string {
  if (configFile === undefined) throw new Error('the e2e state folder needs a Playwright config file')
  return dirname(configFile)
}

export function e2eServerLog(configDir: string, port: number): string {
  return join(e2eStateDir(configDir), `server-${port}.log`)
}

export async function e2ePort(server: string): Promise<number> {
  const variable = `CONCIV_E2E_${server.toUpperCase().replaceAll('-', '_')}_PORT`
  const pinned = process.env[variable]
  if (pinned) return Number(pinned)
  const port = await getPort()
  process.env[variable] = String(port)
  return port
}

function serverEntry(entry: {
  configDir: string
  prepare: string
  command: string
  port: number
  env: {CONCIV_HOME: string} & Record<string, string>
}) {
  return {
    command: `rm -rf '${legacyStateDir(entry.configDir)}' && ${entry.prepare} && (${entry.command}) 2>&1 | tee '${e2eServerLog(entry.configDir, entry.port)}'`,
    url: `http://localhost:${entry.port}`,
    reuseExistingServer: false,
    stdout: 'pipe' as const,
    timeout: 180_000,
    env: entry.env,
  }
}

function freshFolder(folder: string): string {
  return `rm -rf '${folder}' && mkdir -p '${folder}'`
}

function copyPlugins(configDir: string, plugins: readonly string[]): string[] {
  return plugins.map((plugin) => {
    const copy = e2ePluginCopyDir(configDir, plugin)
    return `mkdir -p '${dirname(copy)}' && cp -R '${join(configDir, 'plugin-sources', plugin)}' '${copy}'`
  })
}

function fakeCliFolder(configDir: string): string {
  return join(e2eStateDir(configDir), 'fake-clis')
}

function writeFakeClis(configDir: string, clis: readonly string[]): string[] {
  if (clis.length === 0) return []
  const folder = fakeCliFolder(configDir)
  return [
    `mkdir -p '${folder}'`,
    `ln -s '${process.execPath}' '${join(folder, 'node')}'`,
    ...clis.map((cli) => `printf '#!/bin/sh\\nexit 1\\n' > '${join(folder, cli)}' && chmod +x '${join(folder, cli)}'`),
  ]
}

function pathWithOnly(configDir: string, clis: readonly string[]): Record<string, string> {
  if (clis.length === 0) return {}
  return {PATH: [fakeCliFolder(configDir), '/usr/bin', '/bin'].join(delimiter)}
}

function runConcivHome(configDir: string): {CONCIV_HOME: string} {
  const home = join(e2eStateDir(configDir), 'conciv-home')
  process.env.CONCIV_HOME = home
  return {CONCIV_HOME: home}
}

export function readAppServer(metadata: Record<string, unknown>): AppServer | undefined {
  if (metadata['appServer'] === undefined) return undefined
  const server = AppServerSchema.parse(metadata['appServer'])
  return {
    dir: server.dir,
    concivHome: server.concivHome,
    env: server.env,
    command: (port) => {
      const [file, ...args] = server.argv.map((part) => (part === PORT_SLOT ? String(port) : part))
      if (file === undefined) throw new Error('the appServer project metadata holds an empty argv')
      return {file, args}
    },
  }
}

export async function e2eConfig(
  app: E2EApp,
  opts: {
    dir: string
    runFolders?: string[]
    browserSettings?: readonly BrowserSetting[]
    pluginCopies?: readonly string[]
    fakeClis?: readonly string[]
  } & (
    | {command: (port: number, coldStart: string) => string; viteServerPerTest?: never}
    | {viteServerPerTest: string; command?: never}
  ),
): Promise<ReturnType<typeof defineConfig>> {
  const home = runConcivHome(opts.dir)
  const prepare = [
    freshFolder(e2eStateDir(opts.dir)),
    ...copyPlugins(opts.dir, opts.pluginCopies ?? []),
    ...writeFakeClis(opts.dir, opts.fakeClis ?? []),
  ].join(' && ')
  const path = pathWithOnly(opts.dir, opts.fakeClis ?? [])
  const shared = {
    testDir: './test',
    testIgnore: PACKED_SPECS,
    workers: 1,
    ...DEFAULTS,
    reporter: reporters(opts.dir, ['.conciv'], opts.runFolders),
  }
  if (opts.viteServerPerTest !== undefined) {
    return defineConfig({
      ...shared,
      globalSetup: join(import.meta.dirname, 'prepare-run.ts'),
      metadata: {prepare: `rm -rf '${legacyStateDir(opts.dir)}' && ${prepare}`},
      projects: appProjects(opts.browserSettings ?? [], {
        appServer: {
          dir: opts.dir,
          argv: [opts.viteServerPerTest, '--port', PORT_SLOT, '--strictPort'],
          concivHome: home.CONCIV_HOME,
          env: path,
        },
      }),
    })
  }
  const port = await e2ePort(app)
  return defineConfig({
    ...shared,
    use: {...DEFAULTS.use, baseURL: `http://localhost:${port}`},
    webServer: serverEntry({
      configDir: opts.dir,
      prepare,
      command: `rm -rf .conciv && ${opts.command(port, VITE_COLD_START)}`,
      port,
      env: {...home, ...path},
    }),
    projects: appProjects(opts.browserSettings ?? [], {}),
  })
}

export type PackedServer = {
  name: string
  command: (port: number) => string
  cwd: string
  env: Record<string, string>
}

async function withPorts<T extends {name: string}>(servers: readonly T[]): Promise<(T & {port: number})[]> {
  const picked: (T & {port: number})[] = []
  for (const server of servers) picked.push({...server, port: await e2ePort(server.name)})
  return picked
}

function packedHome(stateDir: string, server: string): string {
  return join(stateDir, `conciv-home-${server}`)
}

export async function packedE2eConfig(opts: {
  dir: string
  runFolders: string[]
  servers: PackedServer[]
}): Promise<ReturnType<typeof defineConfig>> {
  const stateDir = e2eStateDir(opts.dir)
  const servers = await withPorts(opts.servers)
  return defineConfig({
    testDir: './test',
    testMatch: PACKED_SPECS,
    workers: 1,
    ...DEFAULTS,
    reporter: reporters(opts.dir, [], opts.runFolders),
    webServer: servers.map((server) => {
      const home = packedHome(stateDir, server.name)
      return {
        ...serverEntry({
          configDir: opts.dir,
          prepare: freshFolder(home),
          command: server.command(server.port),
          port: server.port,
          env: {...server.env, CONCIV_HOME: home},
        }),
        cwd: server.cwd,
      }
    }),
    projects: servers.map((server) => ({
      name: server.name,
      use: {...devices['Desktop Chrome'], baseURL: `http://localhost:${server.port}`},
      metadata: {projectDir: server.cwd},
    })),
  })
}

function isHarnessApp(name: string): name is HarnessApp {
  return HARNESSES.some((harness) => harness === name)
}

function selectedHarnesses(): readonly HarnessApp[] {
  const filter = process.env.CONCIV_HARNESS
  if (!filter) return HARNESSES
  if (!isHarnessApp(filter)) {
    throw new Error(`CONCIV_HARNESS="${filter}" is not a harness; pick one of ${HARNESSES.join(', ')}`)
  }
  return [filter]
}

export function harnessHome(configDir: string, harness: HarnessApp): string {
  return join(e2eStateDir(configDir), harness)
}

function isolatedHome(configDir: string, harness: HarnessApp): {CONCIV_HOME: string} & Record<string, string> {
  const home = harnessHome(configDir, harness)
  return {HOME: home, CODEX_HOME: join(home, '.codex'), CONCIV_HOME: join(home, '.conciv-home')}
}

export async function harnessMatrixConfig(opts: {
  dir: string
  command: (harness: HarnessApp, port: number, coldStart: string) => string
}): Promise<ReturnType<typeof defineConfig>> {
  const entries = await withPorts(selectedHarnesses().map((name) => ({name})))
  return defineConfig({
    testDir: './test',
    workers: 1,
    ...DEFAULTS,
    reporter: reporters(
      opts.dir,
      entries.map(({name}) => `.conciv-${name}`),
    ),
    webServer: entries.map(({name: harness, port}) =>
      serverEntry({
        configDir: opts.dir,
        prepare: `rm -rf '${harnessHome(opts.dir, harness)}' && mkdir -p '${join(harnessHome(opts.dir, harness), '.codex')}'`,
        command: `rm -rf .conciv-${harness} && ${opts.command(harness, port, VITE_COLD_START)}`,
        port,
        env: isolatedHome(opts.dir, harness),
      }),
    ),
    projects: entries.map(({name: harness, port}) => ({
      name: harness,
      use: {...devices['Desktop Chrome'], baseURL: `http://localhost:${port}`},
      metadata: {projectDir: join(opts.dir, `.conciv-${harness}`)},
    })),
  })
}
