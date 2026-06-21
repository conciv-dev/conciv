import {spawn, type ChildProcess} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'

export type TrailSupervisorOptions = {dataDir: string; port: number; bin?: string}

export type TrailSupervisor = {
  start: () => Promise<void>
  stop: () => Promise<void>
  onExit: (cb: () => void) => void
  baseUrl: string
  pid: number | null
}

const READY = /Listening on/

function spawnTrail(bin: string, dataDir: string, port: number): ChildProcess {
  return spawn(
    bin,
    ['--data-dir', dataDir, 'run', '-a', `localhost:${port}`, '--stderr-logging', '--cors-allowed-origins', ''],
    {stdio: ['ignore', 'ignore', 'pipe']},
  )
}

function waitForLog(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      if (!READY.test(chunk.toString())) return
      child.stderr?.off('data', onData)
      resolve()
    }
    child.stderr?.on('data', onData)
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`trail exited before ready (code ${code})`)))
  })
}

async function waitForHttp(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const ok = await fetch(`${baseUrl}/api/healthcheck`).then(
      () => true,
      () => false,
    )
    if (ok) return
    await delay(50)
  }
  throw new Error(`trail did not accept connections at ${baseUrl}`)
}

export function createTrailSupervisor(opts: TrailSupervisorOptions): TrailSupervisor {
  const bin = opts.bin ?? 'trail'
  const baseUrl = `http://localhost:${opts.port}`
  const exitHandlers: (() => void)[] = []
  const state: {child: ChildProcess | null; intentional: boolean} = {child: null, intentional: false}

  const onChildExit = (): void => {
    const wasIntentional = state.intentional
    state.child = null
    if (wasIntentional) return
    for (const cb of exitHandlers) cb()
  }

  return {
    baseUrl,
    get pid() {
      return state.child?.pid ?? null
    },
    onExit: (cb) => void exitHandlers.push(cb),
    start: async () => {
      state.intentional = false
      const child = spawnTrail(bin, opts.dataDir, opts.port)
      state.child = child
      child.once('exit', onChildExit)
      await waitForLog(child)
      await waitForHttp(baseUrl)
    },
    stop: async () => {
      const child = state.child
      if (!child) return
      state.intentional = true
      await new Promise<void>((resolve) => {
        child.once('close', () => resolve())
        child.kill('SIGTERM')
      })
    },
  }
}
