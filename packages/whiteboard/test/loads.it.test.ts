import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createLiveDb, createTrailSupervisor, type TrailSupervisor} from '@mandarax/core/db'
import {createSnapshotStore, createSync} from '@mandarax/core/sync'
import {start, type Engine} from '@mandarax/core/engine'
import {collectServerContributions} from '@mandarax/extensions'
import whiteboard from '../src/index.js'

describe('whiteboard loads', () => {
  it('contributes a server tool through collectServerContributions', () => {
    const c = collectServerContributions([whiteboard])
    expect(c.tools.map((t) => t.name)).toContain('whiteboard.ping')
  })
})

const state: {engine?: Engine; sup?: TrailSupervisor; dir?: string; core: string} = {core: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-wb-loads-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const sync = createSync({store: createSnapshotStore(db)})
  const sup = createTrailSupervisor({dataDir: dir, port: trailPort})
  state.sup = sup
  await sup.start()
  const engine = await start({
    options: {stateRoot: dir, harnessBin: 'true'},
    root: dir,
    launchEditor: () => {},
    extensions: collectServerContributions([whiteboard], {db, sync: sync.engine}),
    dbProxyTarget: sup.baseUrl,
    syncHooks: sync.hooks,
  })
  state.engine = engine
  state.core = `http://127.0.0.1:${engine.port}`
}, 90_000)

afterAll(async () => {
  await state.engine?.stop()
  await state.sup?.stop()
  if (state.dir) rmSync(state.dir, {recursive: true, force: true})
})

describe('whiteboard loads (it) — first-party on a booted stack', () => {
  it('answers whiteboard.ping with "pong" over /api/tools/run', async () => {
    const res = await fetch(`${state.core}/api/tools/run`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({name: 'whiteboard.ping', input: {}}),
    })
    expect(res.status).toBe(200)
    expect((await res.json()) as {result: unknown}).toEqual({result: 'pong'})
  })
})
