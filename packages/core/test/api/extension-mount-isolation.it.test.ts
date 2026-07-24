import {afterEach, describe, expect, it, vi} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {makeApp, type MadeApp} from '../../src/app.js'
import type {ResolvedConcivConfig} from '../../src/config.js'
import {requireClaude} from '../helpers/adapters.js'

function cfgFor(stateRoot: string): ResolvedConcivConfig {
  return {
    enabled: true,
    widgetUrl: undefined,
    stateRoot,
    harness: 'claude',
    harnessBin: undefined,
    sessionId: '',
    systemPrompt: '',
    extensions: undefined,
  }
}

const healthyTool = defineTool({
  name: 'healthy.ok',
  description: 'a healthy tool',
  inputSchema: z.object({}),
}).server(() => ({ok: true}))

describe('extension mount isolation (real makeApp)', () => {
  const state = {stateRoot: undefined as string | undefined, made: undefined as MadeApp | undefined}

  afterEach(() => {
    state.made?.closeDb()
    if (state.stateRoot) rmSync(state.stateRoot, {recursive: true, force: true})
    state.made = undefined
    state.stateRoot = undefined
  })

  it('boots surviving extensions when one extension throws while mounting', async () => {
    const errors: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      errors.push(String(chunk))
      return true
    })
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-mount-'))
    state.stateRoot = stateRoot

    const broken = defineExtension({name: 'broken'}).server(() => {
      throw new Error('boom')
    })
    const healthy = defineExtension({name: 'healthy', tools: [healthyTool]}).server(() => ({context: {ready: true}}))

    try {
      const made = await makeApp({
        cfg: cfgFor(stateRoot),
        cwd: stateRoot,
        openInEditor: () => {},
        harness: requireClaude(),
        extensions: [broken, healthy],
      })
      state.made = made

      expect(made.extensionContexts.healthy).toEqual({ready: true})
      expect('broken' in made.extensionContexts).toBe(false)
      expect(errors.some((line) => line.includes('extension "broken" failed to mount'))).toBe(true)
    } finally {
      spy.mockRestore()
    }
  }, 30_000)

  it('still fails boot loudly on a duplicate extension name (config error is not swallowed)', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-mount-dup-'))
    state.stateRoot = stateRoot
    const first = defineExtension({name: 'dup'}).server(() => ({context: {}}))
    const second = defineExtension({name: 'dup'}).server(() => ({context: {}}))
    await expect(
      makeApp({
        cfg: cfgFor(stateRoot),
        cwd: stateRoot,
        openInEditor: () => {},
        harness: requireClaude(),
        extensions: [first, second],
      }),
    ).rejects.toThrow(/name collision/)
  }, 30_000)
})
