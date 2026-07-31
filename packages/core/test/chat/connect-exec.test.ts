import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync} from 'node:fs'
import {writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import type {HarnessConnectPlan} from '@conciv/protocol/harness-types'
import {createRecordingTerminalOpener} from '@conciv/harness-testkit'
import {
  executeConnectPlan,
  renderBashScript,
  renderCmdScript,
  renderConnectCommand,
  sweepLaunchScripts,
} from '../../src/chat/connect-exec.js'

const dirs: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

function plan(overrides: Partial<HarnessConnectPlan> = {}): HarnessConnectPlan {
  return {argv: ['claude', '--resume', 'tok-1'], env: {}, files: [], ...overrides}
}

describe('renderConnectCommand', () => {
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  it('quotes the workdir and every argument', () => {
    expect(renderConnectCommand(plan({argv: ['claude', '{"a":1}']}), '/tmp/my dir')).toBe(
      `cd '/tmp/my dir' && 'claude' '{"a":1}'`,
    )
  })

  it('prefixes environment entries onto the command that runs, not onto cd', () => {
    const command = renderConnectCommand(plan({env: {CONCIV_URL: 'http://x/y', CONCIV_TOKEN: 'abc'}}), '/w')
    expect(command).toBe(`cd '/w' && CONCIV_URL='http://x/y' CONCIV_TOKEN='abc' 'claude' '--resume' 'tok-1'`)
  })

  it('escapes single quotes inside environment values', () => {
    expect(renderConnectCommand(plan({env: {Q: "it's"}}), '/w')).toContain(`Q='it'\\''s'`)
  })
})

describe('renderCmdScript', () => {
  it('doubles every percent so cmd cannot expand a variable out of a value', () => {
    const script = renderCmdScript(
      plan({env: {CONCIV_MCP_URL: 'http://127.0.0.1:1/a%20b', PATHY: '%USERPROFILE%'}}),
      String.raw`C:\work\100% done`,
    )
    expect(script).toContain('set "CONCIV_MCP_URL=http://127.0.0.1:1/a%%20b"')
    expect(script).toContain('set "PATHY=%%USERPROFILE%%"')
    expect(script).toContain(String.raw`cd /d "C:\work\100%% done"`)
    expect(script).not.toMatch(/(^|[^%])%[A-Za-z_][A-Za-z0-9_]*%/m)
  })

  it('doubles percent inside arguments too', () => {
    expect(renderCmdScript(plan({argv: ['claude', '--resume', '50%']}), 'C:\\w')).toContain('"50%%"')
  })
})

describe('renderBashScript', () => {
  it('sets each environment value once, scoped to the command it launches', () => {
    const url = 'http://127.0.0.1:5173/api/mcp'
    const script = renderBashScript(plan({env: {CONCIV_MCP_URL: url}}), '/w')
    expect(script.split(url)).toHaveLength(2)
    expect(script).not.toContain('export ')
  })

  it('escapes single quotes in environment values', () => {
    expect(renderBashScript(plan({env: {Q: "it's"}}), '/w')).toContain(`Q='it'\\''s'`)
  })
})

describe('sweepLaunchScripts', () => {
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  it('removes launch scripts older than an hour and keeps the fresh ones', async () => {
    const stateDir = tmp('conciv-connect-sweep-')
    const launch = join(stateDir, 'launch')
    mkdirSync(launch, {recursive: true})
    const stale = join(launch, 'stale.command')
    const fresh = join(launch, 'fresh.command')
    writeFileSync(stale, 'old')
    writeFileSync(fresh, 'new')
    const now = Date.now()
    utimesSync(stale, new Date(now - 2 * 60 * 60 * 1000), new Date(now - 2 * 60 * 60 * 1000))
    await sweepLaunchScripts(stateDir, now)
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
  })

  it('is a no-op when no launch directory exists', async () => {
    const stateDir = tmp('conciv-connect-sweep-empty-')
    await expect(sweepLaunchScripts(stateDir, Date.now())).resolves.toBeUndefined()
  })
})

describe('executeConnectPlan', () => {
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  it('builds the windows command without leaving a script behind when it is not opening', async () => {
    const stateDir = tmp('conciv-connect-win-')
    const result = await executeConnectPlan(plan({env: {A: 'b'}}), {
      cwd: 'C:\\work',
      stateDir,
      open: false,
      openTerminal: createRecordingTerminalOpener().open,
      platform: () => 'win32',
    })
    expect(result.opened).toBe(false)
    expect(result.command).toBe(String.raw`cd /d "C:\work" && set "A=b" && "claude" "--resume" "tok-1"`)
    expect(existsSync(join(stateDir, 'launch'))).toBe(false)
  })

  it('hands the opener an owner-only script and removes it once the terminal has read it', async () => {
    vi.useFakeTimers()
    try {
      const stateDir = tmp('conciv-connect-mode-')
      const seen: {path: string; mode: number}[] = []
      const result = await executeConnectPlan(plan(), {
        cwd: '/w',
        stateDir,
        open: true,
        openTerminal: (command) => {
          const path = command.args.at(-1) ?? ''
          seen.push({path, mode: statSync(path).mode & 0o777})
          return Promise.resolve(true)
        },
        platform: () => 'darwin',
      })
      expect(result.opened).toBe(true)
      expect(seen[0]?.mode).toBe(0o700)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(readdirSync(join(stateDir, 'launch'))).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes plan files under new parent directories with owner-only permissions', async () => {
    const stateDir = tmp('conciv-connect-state-')
    const path = join(stateDir, 'nested', 'deep', 'settings.json')
    await executeConnectPlan(plan({files: [{path, contents: '{"hook":true}'}]}), {
      cwd: stateDir,
      stateDir,
      open: false,
      openTerminal: createRecordingTerminalOpener().open,
    })
    expect(readFileSync(path, 'utf8')).toBe('{"hook":true}')
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('honours an explicit file mode', async () => {
    const stateDir = tmp('conciv-connect-state-')
    const path = join(stateDir, 'hook.sh')
    await executeConnectPlan(plan({files: [{path, contents: '#!/bin/sh\n', mode: 0o755}]}), {
      cwd: stateDir,
      stateDir,
      open: false,
      openTerminal: createRecordingTerminalOpener().open,
    })
    expect(statSync(path).mode & 0o777).toBe(0o755)
  })

  it('resolves a relative file path against the state dir', async () => {
    const stateDir = tmp('conciv-connect-state-')
    await executeConnectPlan(plan({files: [{path: 'connect/hook.json', contents: 'x'}]}), {
      cwd: stateDir,
      stateDir,
      open: false,
      openTerminal: createRecordingTerminalOpener().open,
    })
    expect(readFileSync(join(stateDir, 'connect', 'hook.json'), 'utf8')).toBe('x')
  })

  it('returns the command unopened when opening is off', async () => {
    const stateDir = tmp('conciv-connect-state-')
    const opener = createRecordingTerminalOpener()
    const result = await executeConnectPlan(plan({env: {A: 'b'}}), {
      cwd: '/w',
      stateDir,
      open: false,
      openTerminal: opener.open,
    })
    expect(result.opened).toBe(false)
    expect(result.command).toBe(renderConnectCommand(plan({env: {A: 'b'}}), '/w'))
    expect(opener.opened).toEqual([])
  })

  it('opens through the injected opener instead of spawning a terminal itself', async () => {
    const stateDir = tmp('conciv-connect-state-')
    const opener = createRecordingTerminalOpener()
    const result = await executeConnectPlan(plan(), {cwd: stateDir, stateDir, open: true, openTerminal: opener.open})
    expect(result.opened).toBe(true)
    expect(opener.opened).toHaveLength(1)
    expect(opener.opened[0]?.bin).not.toBe('')
  })
})
