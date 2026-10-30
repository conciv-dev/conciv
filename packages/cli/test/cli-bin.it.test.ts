import {spawnSync} from 'node:child_process'
import {createServer} from 'node:net'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

const ESCAPE = '\u001b'
const COLOR_VARIABLES = new Set(['NO_COLOR', 'FORCE_COLOR', 'CI', 'TEST', 'TERM'])
const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url))

let cwd = ''
let closedPort = 0

function freedPort(): Promise<number> {
  const server = createServer()
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function colorFreeEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const inherited = Object.entries(process.env).filter(([name]) => !COLOR_VARIABLES.has(name))
  return {...Object.fromEntries(inherited), TERM: 'xterm-256color', CONCIV_PORT: String(closedPort), ...extra}
}

function conciv(args: string[], extra: Record<string, string> = {}): {status: number | null; stdout: string} {
  const run = spawnSync(process.execPath, [bin, ...args], {cwd, env: colorFreeEnv(extra), encoding: 'utf8'})
  return {status: run.status, stdout: run.stdout}
}

beforeAll(async () => {
  cwd = mkdtempSync(join(tmpdir(), 'conciv-cli-bin-'))
  closedPort = await freedPort()
})

afterAll(() => {
  rmSync(cwd, {recursive: true, force: true})
})

describe('the built conciv bin through a pipe', () => {
  it('prints --help without ANSI escapes when stdout is not a terminal', () => {
    const help = conciv(['--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('tools')
    expect(help.stdout).not.toContain(ESCAPE)
  })

  it('keeps colour when FORCE_COLOR asks for it', () => {
    expect(conciv(['--help'], {FORCE_COLOR: '1'}).stdout).toContain(ESCAPE)
  })

  it('lists the built-in page verbs offline and says so on the last line', () => {
    const help = conciv(['tools', 'page', '--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('snapshot')
    expect(help.stdout).toContain('fill')
    expect(help.stdout.trim().split('\n').at(-1)).toBe(
      'offline: showing the built-in page capabilities; a running server may add more',
    )
  })

  it('lists only the react verbs under react --help offline', () => {
    const help = conciv(['tools', 'react', '--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('locate')
    expect(help.stdout).not.toContain('fill')
  })

  it('shows a verb flags offline', () => {
    const help = conciv(['tools', 'page', 'fill', '--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('--value')
  })

  it('running a page verb offline still fails, pointing at server.json and CONCIV_PORT', () => {
    const run = conciv(['tools', 'page', 'snapshot'])
    expect(run.status).toBe(1)
    const document: unknown = JSON.parse(run.stdout)
    expect(document).toMatchObject({
      ok: false,
      error: {
        kind: 'user',
        message: `No conciv dev server on 127.0.0.1:${closedPort}.`,
        hint: "Start your app (pnpm dev). conciv reads the engine port from .conciv/server.json; CONCIV_PORT=<engine port> overrides it (this is the conciv engine port, not Vite's).",
      },
    })
  })
})
