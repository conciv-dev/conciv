import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {collectServerContributions} from '@mandarax/extensions'
import {createLiveDb} from '@mandarax/core/db'
import {createSnapshotStore, createSync} from '@mandarax/core/sync'
import whiteboard from '../src/index.js'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {runTool, sessionId} from './helpers/run-tool.js'

describe('whiteboard loads', () => {
  it('contributes a server tool through collectServerContributions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mx-wb-loads-'))
    const db = createLiveDb({trailBaseUrl: 'http://localhost:0', dataDir: dir})
    const sync = createSync({store: createSnapshotStore(db)})
    const c = collectServerContributions([whiteboard], {db, sync: sync.engine})
    expect(c.tools.map((t) => t.name)).toContain('whiteboard.ping')
    rmSync(dir, {recursive: true, force: true})
  })
})

const state: {stack?: Stack} = {}

beforeAll(async () => {
  state.stack = await bootStack()
}, 90_000)

afterAll(async () => {
  await state.stack?.stop()
})

describe('whiteboard loads (it) — first-party on a booted stack', () => {
  it('answers whiteboard.ping with "pong" over /api/tools/run', async () => {
    const res = await runTool(state.stack!.core, sessionId('loads'), 'whiteboard.ping', {})
    expect(res.status).toBe(200)
    expect((await res.json()) as {result: unknown}).toEqual({result: 'pong'})
  })
})
