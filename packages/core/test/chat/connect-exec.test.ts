import {mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import type {HarnessConnectPlan} from '@conciv/protocol/harness-types'
import {executeConnectPlan, renderConnectCommand} from '../../src/chat/connect-exec.js'

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

describe('executeConnectPlan', () => {
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  it('writes plan files under new parent directories with owner-only permissions', async () => {
    const stateDir = tmp('conciv-connect-state-')
    const path = join(stateDir, 'nested', 'deep', 'settings.json')
    await executeConnectPlan(plan({files: [{path, contents: '{"hook":true}'}]}), {
      cwd: stateDir,
      stateDir,
      open: false,
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
    })
    expect(statSync(path).mode & 0o777).toBe(0o755)
  })

  it('resolves a relative file path against the state dir', async () => {
    const stateDir = tmp('conciv-connect-state-')
    await executeConnectPlan(plan({files: [{path: 'connect/hook.json', contents: 'x'}]}), {
      cwd: stateDir,
      stateDir,
      open: false,
    })
    expect(readFileSync(join(stateDir, 'connect', 'hook.json'), 'utf8')).toBe('x')
  })

  it('returns the command unopened when opening is off', async () => {
    const stateDir = tmp('conciv-connect-state-')
    const result = await executeConnectPlan(plan({env: {A: 'b'}}), {cwd: '/w', stateDir, open: false})
    expect(result.opened).toBe(false)
    expect(result.command).toBe(renderConnectCommand(plan({env: {A: 'b'}}), '/w'))
  })
})
