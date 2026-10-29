import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createFakeHarness} from '@conciv/harness-testkit'
import {HealthSchema} from '../../src/app.js'
import {start, type Engine} from '../../src/start.js'

let engine: Engine

beforeAll(async () => {
  engine = await start({
    options: {},
    root: mkdtempSync(join(tmpdir(), 'conciv-gate-')),
    launchEditor: () => {},
    harness: createFakeHarness({id: 'fake-gate'}),
    accessToken: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  })
}, 30_000)

afterAll(async () => {
  await engine.stop()
})

describe('token-gated core', () => {
  it('serves health under the token prefix', async () => {
    const res = await fetch(`http://127.0.0.1:${engine.port}/t/7c9e6679-7425-40de-944b-e07fc1f90ae7/health`)
    expect(res.status).toBe(200)
    const raw = z.record(z.string(), z.unknown()).parse(await res.json())
    expect(Object.keys(raw).toSorted()).toEqual(['engine', 'harness', 'ok'])
    expect(Object.keys(z.record(z.string(), z.unknown()).parse(raw.engine)).toSorted()).toEqual([
      'bootedAt',
      'changed',
      'fingerprint',
      'stale',
      'tracked',
    ])
    expect(HealthSchema.parse(raw)).toEqual({
      ok: true,
      harness: 'fake-gate',
      engine: {
        stale: false,
        changed: [],
        tracked: expect.arrayContaining(['@conciv/core']),
        bootedAt: expect.any(Number),
        fingerprint: expect.any(String),
      },
    })
  })

  it('404s the wrong token and the bare path', async () => {
    const wrong = await fetch(`http://127.0.0.1:${engine.port}/t/nope/health`)
    const bare = await fetch(`http://127.0.0.1:${engine.port}/health`)
    expect(wrong.status).toBe(404)
    expect(bare.status).toBe(404)
  })

  it('serves rpc under the prefix', async () => {
    const res = await fetch(
      `http://127.0.0.1:${engine.port}/t/7c9e6679-7425-40de-944b-e07fc1f90ae7/rpc/sessions/list`,
      {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: '{"json":null}',
      },
    )
    expect(res.status).toBe(200)
  })
})
