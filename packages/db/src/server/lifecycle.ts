import {spawn} from 'node:child_process'
import {prepareDepot} from './depot.js'
import {isStateError, stateError} from '../errors.js'
import type {ExtensionTableSpec} from './extension-tables.js'

async function waitHealthy(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/healthcheck`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw stateError('server-unhealthy', `trailbase not healthy after ${timeoutMs}ms`, {url, timeoutMs})
}

export async function startTrailBase(opts: {
  binary: string
  dataDir: string
  port: number
  dev?: boolean
  extensionTables?: ExtensionTableSpec[]
  allowedOrigins?: string[]
}): Promise<{port: number; url: string; stop(): Promise<void>}> {
  prepareDepot({dataDir: opts.dataDir, extensionTables: opts.extensionTables})
  const url = `http://127.0.0.1:${opts.port}`
  const corsArgs = (opts.allowedOrigins ?? []).flatMap((origin) => ['--cors-allowed-origins', origin])
  const args = [
    '--data-dir',
    opts.dataDir,
    'run',
    '-a',
    `127.0.0.1:${opts.port}`,
    ...(opts.dev ? ['--dev'] : []),
    ...corsArgs,
  ]
  const child = spawn(opts.binary, args, {stdio: ['ignore', 'ignore', 'pipe']})
  const stderr: string[] = []
  child.stderr.on('data', (chunk: Buffer) => {
    stderr.push(String(chunk))
    if (stderr.length > 50) stderr.shift()
  })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  try {
    await waitHealthy(url, 30000)
  } catch (error) {
    child.kill('SIGKILL')
    if (isStateError(error)) {
      error.details.stderr = stderr.join('')
      throw error
    }
    throw stateError('server-unhealthy', String(error), {url, stderr: stderr.join('')})
  }
  return {
    port: opts.port,
    url,
    stop: async () => {
      child.kill('SIGTERM')
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
      await exited
      clearTimeout(killTimer)
    },
  }
}
