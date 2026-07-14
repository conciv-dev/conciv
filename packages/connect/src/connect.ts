import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start, type Engine} from '@conciv/core/start'
import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'

const FIRST_PORT = 4732
const LAST_PORT = 4741
const DEFAULT_ORIGIN = 'https://conciv.dev'

export type ConnectOpts = {
  token: string
  harness?: string
  workspace?: string
  origin?: string
  harnessAdapter?: HarnessAdapter
  log?: (line: string) => void
}

function resolveWorkspace(workspace: string | undefined): string {
  if (workspace === '.') return process.cwd()
  return mkdtempSync(join(tmpdir(), 'conciv-connect-'))
}

function resolveAdapter(opts: ConnectOpts): HarnessAdapter {
  if (opts.harnessAdapter) return opts.harnessAdapter
  const adapter = getHarness(opts.harness ?? 'claude')
  if (!adapter) throw new Error(`unknown harness "${opts.harness}" — try claude, codex, gemini-cli, opencode or pi`)
  return adapter
}

export async function runConnect(opts: ConnectOpts): Promise<Engine> {
  const adapter = resolveAdapter(opts)
  const root = resolveWorkspace(opts.workspace)
  const log = opts.log ?? (() => {})
  let lastError: unknown
  for (let port = FIRST_PORT; port <= LAST_PORT; port += 1) {
    try {
      const engine = await start({
        options: {harness: adapter.id, stateRoot: root},
        root,
        port,
        launchEditor: () => {},
        harness: adapter,
        accessToken: opts.token,
        allowedOrigins: [opts.origin ?? DEFAULT_ORIGIN],
      })
      log(`connected: conciv core on 127.0.0.1:${engine.port} (harness: ${adapter.id})`)
      log('return to your browser tab — keep this command running')
      return engine
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`no free port between ${FIRST_PORT} and ${LAST_PORT}: ${String(lastError)}`)
}
