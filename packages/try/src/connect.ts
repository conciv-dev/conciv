import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start, type Engine} from '@conciv/core/start'
import terminal from '@conciv/extension-terminal'
import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {CONNECT_FIRST_PORT, CONNECT_LAST_PORT} from '@conciv/protocol/connect-ports'
import {seedWorkspace} from './seed-workspace.js'
import {CONNECT_SYSTEM_PROMPT} from './system-prompt.js'

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
  if (workspace !== undefined) {
    if (workspace !== '.') throw new Error('workspace must be "." when provided')
    return realpathSync(process.cwd())
  }
  return realpathSync(mkdtempSync(join(tmpdir(), 'conciv-connect-')))
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
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
  if (opts.workspace === undefined) {
    const seeded = await seedWorkspace(opts.origin ?? DEFAULT_ORIGIN, root)
    log(seeded ? 'workspace seeded with the landing-page source' : 'no source manifest found — continuing unseeded')
  }
  let lastError: unknown
  for (let port = CONNECT_FIRST_PORT; port <= CONNECT_LAST_PORT; port += 1) {
    try {
      const engine = await start({
        options: {harness: adapter.id, stateRoot: root, systemPrompt: CONNECT_SYSTEM_PROMPT},
        root,
        port,
        launchEditor: () => {},
        harness: adapter,
        extensions: [terminal],
        accessToken: opts.token,
        allowedOrigins: [opts.origin ?? DEFAULT_ORIGIN],
      })
      log(`connected: conciv core on 127.0.0.1:${engine.port} (harness: ${adapter.id})`)
      log('return to your browser tab — keep this command running')
      return engine
    } catch (error) {
      if (!isAddressInUse(error)) throw error
      lastError = error
    }
  }
  throw new Error(`no free port between ${CONNECT_FIRST_PORT} and ${CONNECT_LAST_PORT}: ${String(lastError)}`)
}
