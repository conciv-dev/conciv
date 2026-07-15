import {describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {createFakeHarness} from '@conciv/harness-testkit'
import {start} from '../src/start.js'

describe('start harness DI', () => {
  it('uses the injected harness instead of the registry', async () => {
    const fake = createFakeHarness({id: 'fake-start-di', text: 'ok'})
    const marker = {seen: false}
    const harness: HarnessAdapter = Object.assign({}, fake)
    Object.defineProperty(harness, 'id', {
      get() {
        marker.seen = true
        return 'fake-start-di'
      },
    })
    const root = mkdtempSync(join(tmpdir(), 'conciv-start-di-'))
    const engine = await start({
      options: {stateRoot: root, systemPrompt: false, harness: 'fake-start-di'},
      root,
      harness,
      extensions: [],
      launchEditor: () => {},
    })
    expect(marker.seen).toBe(true)
    await engine.stop()
    rmSync(root, {recursive: true, force: true})
  })
})
