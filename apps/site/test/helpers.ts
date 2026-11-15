import {spawn, type ChildProcess} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll} from 'vitest'
import {test as browserTest} from '@conciv/browser-fixture'
import {until} from '@conciv/harness-testkit/until'

type WranglerDev = {
  origin: string
  stop: () => Promise<void>
}

const SITE_ROOT = join(import.meta.dirname, '..')
const FORCE_KILL_DELAY = 5_000
const GROUP_EXIT_TIMEOUT = 20_000

function signalGroup(groupId: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-groupId, signal)
    return true
  } catch {
    return false
  }
}

function whenExited(site: ChildProcess): Promise<void> {
  if (site.exitCode !== null || site.signalCode !== null) return Promise.resolve()
  return new Promise<void>((resolve) => site.once('exit', () => resolve()))
}

async function stopProcessTree(site: ChildProcess): Promise<void> {
  const groupId = site.pid
  if (groupId === undefined) return
  const exited = whenExited(site)
  signalGroup(groupId, 'SIGTERM')
  const forceKill = setTimeout(() => signalGroup(groupId, 'SIGKILL'), FORCE_KILL_DELAY)
  try {
    await exited
    await until(() => signalGroup(groupId, 0) === false, {hangGuardMs: GROUP_EXIT_TIMEOUT, intervalMs: 50})
  } finally {
    clearTimeout(forceKill)
  }
}

function whenReady(site: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output: string[] = []
    const watch = (chunk: Buffer) => {
      output.push(String(chunk))
      if (String(chunk).includes('Ready')) resolve()
    }
    site.stdout?.on('data', watch)
    site.stderr?.on('data', watch)
    site.on('exit', () => reject(new Error(`wrangler dev exited:\n${output.join('')}`)))
  })
}

function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address === null || typeof address === 'string') return reject(new Error('no TCP port was assigned'))
        resolve(address.port)
      })
    })
  })
}

async function startWranglerDev(): Promise<WranglerDev> {
  const port = await findFreePort()
  const inspectorPort = await findFreePort()
  const persistDirectory = await mkdtemp(join(tmpdir(), 'conciv-site-e2e-'))
  const site = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--port',
      String(port),
      '--inspector-port',
      String(inspectorPort),
      '--persist-to',
      persistDirectory,
    ],
    {cwd: SITE_ROOT, detached: true},
  )
  const stop = async () => {
    await stopProcessTree(site)
    await rm(persistDirectory, {recursive: true, force: true})
  }
  try {
    await whenReady(site)
  } catch (error) {
    await stop()
    throw error
  }
  return {origin: `http://127.0.0.1:${port}`, stop}
}

const BOOT_TIMEOUT = 120_000

export function serveSite(): () => string {
  let site: WranglerDev | undefined

  beforeAll(async () => {
    site = await startWranglerDev()
  }, BOOT_TIMEOUT)

  afterAll(async () => {
    await site?.stop()
  })

  return () => {
    if (site === undefined) throw new Error('the site is not running yet')
    return site.origin
  }
}

export function createSiteTest() {
  return browserTest.extend<{$file: {site: WranglerDev}}>({
    site: [
      // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
      async ({}, use) => {
        const site = await startWranglerDev()
        await use(site)
        await site.stop()
      },
      {scope: 'file', auto: true},
    ],
  })
}
