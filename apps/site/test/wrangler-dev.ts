import {spawn, type ChildProcess} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export type WranglerDev = {
  stop: () => Promise<void>
}

const SITE_ROOT = join(import.meta.dirname, '..')
const FORCE_KILL_DELAY = 5_000

function signalGroup(groupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-groupId, signal)
  } catch {
    return
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
  await exited
  clearTimeout(forceKill)
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

export async function startWranglerDev(options: {port: number; inspectorPort: number}): Promise<WranglerDev> {
  const persistDirectory = await mkdtemp(join(tmpdir(), 'conciv-site-e2e-'))
  const site = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--port',
      String(options.port),
      '--inspector-port',
      String(options.inspectorPort),
      '--persist-to',
      persistDirectory,
    ],
    {cwd: SITE_ROOT, detached: true},
  )
  await whenReady(site)
  return {
    stop: async () => {
      await stopProcessTree(site)
      await rm(persistDirectory, {recursive: true, force: true})
    },
  }
}
