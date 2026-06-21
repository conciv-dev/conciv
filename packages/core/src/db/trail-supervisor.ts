import {spawn, type ChildProcess} from 'node:child_process'
import pRetry from 'p-retry'
import pWaitFor from 'p-wait-for'

export type TrailSupervisorOptions = {
  dataDir: string
  port: number
  bin?: string
  startRetries?: number
  crashRestarts?: number
  stableMs?: number
}

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
    ['--data-dir', dataDir, 'run', '-a', `127.0.0.1:${port}`, '--stderr-logging', '--cors-allowed-origins', ''],
    {stdio: ['ignore', 'ignore', 'pipe']},
  )
}

function waitForLog(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (settle: () => void): void => {
      child.stderr?.off('data', onData)
      child.off('error', onError)
      child.off('exit', onExit)
      settle()
    }
    const onData = (chunk: Buffer): void => void (READY.test(chunk.toString()) && finish(resolve))
    const onError = (err: Error): void => finish(() => reject(err))
    const onExit = (code: number | null): void =>
      finish(() => reject(new Error(`trail exited before ready (code ${code})`)))
    child.stderr?.on('data', onData)
    child.on('error', onError)
    child.on('exit', onExit)
  })
}

export function createTrailSupervisor(opts: TrailSupervisorOptions): TrailSupervisor {
  const bin = opts.bin ?? 'trail'
  const baseUrl = `http://127.0.0.1:${opts.port}`
  const startRetries = opts.startRetries ?? 5
  const crashRestarts = opts.crashRestarts ?? 3
  const stableMs = opts.stableMs ?? 10_000
  const exitHandlers: (() => void)[] = []
  const state: {child: ChildProcess | null; intentional: boolean; crashes: number} = {
    child: null,
    intentional: false,
    crashes: 0,
  }
  const retry = {retries: startRetries, minTimeout: 100, factor: 2}
  const healthy = (): Promise<boolean> =>
    fetch(`${baseUrl}/api/healthcheck`).then(
      () => true,
      () => false,
    )

  const launch = async (): Promise<void> => {
    const child = spawnTrail(bin, opts.dataDir, opts.port)
    state.child = child
    try {
      await waitForLog(child)
      await pWaitFor(healthy, {interval: 50, timeout: 5_000})
    } catch (err) {
      child.kill('SIGKILL')
      throw err
    }
    const stable = setTimeout(() => void (state.crashes = 0), stableMs)
    stable.unref?.()
    child.once('exit', () => {
      clearTimeout(stable)
      onCrash()
    })
  }

  const onCrash = (): void => {
    state.child = null
    if (state.intentional) return
    for (const cb of exitHandlers) cb()
    if (++state.crashes > crashRestarts) return
    void pRetry(launch, retry).catch(() => {})
  }

  return {
    baseUrl,
    get pid() {
      return state.child?.pid ?? null
    },
    onExit: (cb) => void exitHandlers.push(cb),
    start: async () => {
      state.intentional = false
      state.crashes = 0
      await pRetry(launch, retry)
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
