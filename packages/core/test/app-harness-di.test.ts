import {describe, expect, it, beforeAll, afterAll} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {StatePlane} from '@conciv/state/server'
import {makeApp} from '../src/app.js'
import {startTestStore} from './helpers/state-plane.js'

let plane: StatePlane

beforeAll(async () => {
  plane = await startTestStore()
}, 120000)

afterAll(async () => plane.stop())

describe('makeApp harness DI', () => {
  it('uses the injected harness over the registry lookup', async () => {
    const real = getHarness('claude')
    if (!real) throw new Error('no claude')
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-di-'))
    const marker = {seen: false}
    const injected: HarnessAdapter = Object.assign({}, real)
    Object.defineProperty(injected, 'id', {
      get() {
        marker.seen = true
        return real.id
      },
    })
    const {disposers} = await makeApp({
      cfg: {
        enabled: true,
        widgetUrl: undefined,
        stateRoot,
        harness: 'claude',
        harnessBin: undefined,
        sessionId: '',
        systemPrompt: '',
        extensions: undefined,
      },
      cwd: stateRoot,
      openInEditor: () => {},
      harness: injected,
      store: plane.store,
    })
    await Promise.all(disposers.map((dispose) => dispose()))
    rmSync(stateRoot, {recursive: true, force: true})
    expect(marker.seen).toBe(true)
  })
})
