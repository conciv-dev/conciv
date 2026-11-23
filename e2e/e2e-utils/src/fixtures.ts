import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process'
import {createWriteStream} from 'node:fs'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {createInterface} from 'node:readline'
import {stripVTControlCharacters} from 'node:util'
import {test as base, expect, type Page} from '@playwright/test'
import getPort from 'get-port'
import {e2eConfigDir, e2eServerLog, readAppServer, type AppServer} from './config.js'
import {e2ePluginCopyDir, e2eStateDir} from './dev-endpoint.js'
import {collectFailures, expectWidgetBoots, loginWidget} from './widget.js'

type RebuildPlugin = (plugin: string, from: string, to: string) => Promise<void>

const VITE_LISTENING = 'Local:'
const REMOVE = {recursive: true, force: true, maxRetries: 5}

async function signIn(page: Page): Promise<void> {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
}

async function startNewSession(page: Page): Promise<void> {
  const launcher = page.getByRole('button', {name: /conciv chat$/})
  if ((await launcher.getAttribute('aria-expanded')) !== 'true') await launcher.click()
  await page.getByRole('button', {name: /, session options$/}).click()
  await page.getByRole('button', {name: /^Session: /}).click()
  await page.getByRole('button', {name: 'New session', exact: true}).click()
  await expect(page.getByText('Started a new session')).toBeVisible()
}

async function signInToNewSession(page: Page): Promise<void> {
  const failures = collectFailures(page)
  await loginWidget(page)
  await startNewSession(page)
  await expectWidgetBoots(page, failures)
}

function viteListening(child: ChildProcessWithoutNullStreams, output: string[]): Promise<void> {
  const {promise, resolve, reject} = Promise.withResolvers<void>()
  createInterface({input: child.stdout}).on('line', (line) => {
    if (stripVTControlCharacters(line).includes(VITE_LISTENING)) resolve()
  })
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    reject(new Error(`the dev server exited (${code ?? signal}) before it listened\n${output.join('')}`))
  })
  return promise
}

function playwrightBrowsersPath(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH
  if (process.platform === 'linux')
    return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'ms-playwright')
  if (process.platform === 'win32')
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ms-playwright')
  return join(homedir(), 'Library', 'Caches', 'ms-playwright')
}

async function wipeState(server: AppServer): Promise<void> {
  await Promise.all([rm(join(server.dir, '.conciv'), REMOVE), rm(server.concivHome, REMOVE)])
}

async function stopServer(child: ChildProcessWithoutNullStreams, exited: Promise<unknown>): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await exited
}

async function runAppServer(
  server: AppServer,
  port: number,
  configDir: string,
  use: (origin: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(e2eStateDir(configDir), 'test-'))
  const home = join(root, 'home')
  await mkdir(home)
  await wipeState(server)
  const {file, args} = server.command(port)
  const child = spawn(file, args, {
    cwd: server.dir,
    env: {
      ...process.env,
      ...server.env,
      CONCIV_HOME: server.concivHome,
      HOME: home,
      PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath(),
    },
  })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const log = createWriteStream(e2eServerLog(configDir, port))
  const output: string[] = []
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk: Buffer) => {
      log.write(chunk)
      output.push(String(chunk))
    })
  }
  try {
    await viteListening(child, output)
    await use(`http://localhost:${port}`)
  } finally {
    await stopServer(child, exited)
    log.end()
    await Promise.all([rm(root, REMOVE), wipeState(server)])
  }
}

export const test = base.extend<{
  signedIn: boolean
  secondPage: Page
  rebuildPlugin: RebuildPlugin
  appServer: string | undefined
}>({
  signedIn: [true, {option: true}],
  // eslint-disable-next-line no-empty-pattern
  appServer: async ({}, use, testInfo) => {
    const server = readAppServer(testInfo.project.metadata)
    if (server === undefined) return use(undefined)
    const port = await getPort()
    await runAppServer(server, port, e2eConfigDir(testInfo.config.configFile), use)
  },
  baseURL: async ({appServer, baseURL}, use) => {
    await use(appServer ?? baseURL)
  },
  page: async ({page, signedIn}, use) => {
    if (signedIn) await signInToNewSession(page)
    await use(page)
  },
  secondPage: async ({browser, signedIn}, use) => {
    const page = await browser.newPage()
    if (signedIn) await signIn(page)
    await use(page)
    await page.close()
  },
  // eslint-disable-next-line no-empty-pattern
  rebuildPlugin: async ({}, use, testInfo) => {
    const originals: {bundle: string; source: string}[] = []
    await use(async (plugin, from, to) => {
      const bundle = join(e2ePluginCopyDir(e2eConfigDir(testInfo.config.configFile), plugin), 'plugin-experimental.js')
      const source = await readFile(bundle, 'utf8')
      originals.unshift({bundle, source})
      if (!source.includes(from)) throw new Error(`${bundle} does not contain "${from}"`)
      await writeFile(bundle, source.replace(from, to))
    })
    for (const {bundle, source} of originals) await writeFile(bundle, source)
  },
})

export {expect} from '@playwright/test'
