import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createFakeHarness} from '@conciv/harness-testkit'
import {start, type Engine} from '@conciv/core/start'

let engine: Engine

beforeAll(async () => {
  engine = await start({
    options: {},
    root: mkdtempSync(join(tmpdir(), 'conciv-gate-')),
    launchEditor: () => {},
    harness: createFakeHarness({id: 'fake-gate'}),
    accessToken: 'tok-123',
  })
}, 30_000)

afterAll(async () => {
  await engine.stop()
})

describe('token-gated core', () => {
  it('serves health under the token prefix', async () => {
    const res = await fetch(`http://127.0.0.1:${engine.port}/t/tok-123/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ok: true, harness: 'fake-gate'})
  })

  it('404s the wrong token and the bare path', async () => {
    const wrong = await fetch(`http://127.0.0.1:${engine.port}/t/nope/health`)
    const bare = await fetch(`http://127.0.0.1:${engine.port}/health`)
    expect(wrong.status).toBe(404)
    expect(bare.status).toBe(404)
  })

  it('serves rpc under the prefix', async () => {
    const res = await fetch(`http://127.0.0.1:${engine.port}/t/tok-123/rpc/sessions/list`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{"json":null}',
    })
    expect(res.status).toBe(200)
  })
})
