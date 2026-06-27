import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createJazzContext, type Db, type JazzContext} from 'jazz-tools/backend'
import {deploy} from 'jazz-tools/dev'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {startJazzRunner, type JazzRunner} from '../src/server/jazz/runner.js'
import {app} from '../src/shared/schema.js'
import permissions from '../src/shared/permissions.js'
import {startCommentEnrichment} from '../src/server/jazz/enrich-worker.js'

const schemaDir = fileURLToPath(new URL('../src/shared', import.meta.url))
const APP = 'function App() {\n  return (\n    <div>\n      <Widget id="a" />\n    </div>\n  )\n}\n'
const loc = (token: string): {line: number; column: number} => {
  const index = APP.indexOf(token)
  const before = APP.slice(0, index)
  return {line: before.split('\n').length, column: index - before.lastIndexOf('\n')}
}

const state: {runner: JazzRunner; context: JazzContext; db: Db; cwd: string; stop: () => void} = {
  runner: undefined as never,
  context: undefined as never,
  db: undefined as never,
  cwd: undefined as never,
  stop: () => {},
}

beforeAll(async () => {
  state.runner = await startJazzRunner({inMemory: true})
  await deploy({
    serverUrl: state.runner.serverUrl,
    appId: state.runner.appId,
    adminSecret: state.runner.adminSecret,
    schemaDir,
  })
  state.context = createJazzContext({
    appId: state.runner.appId,
    app,
    permissions,
    driver: {type: 'memory'},
    serverUrl: state.runner.serverUrl,
    backendSecret: state.runner.backendSecret,
  })
  state.db = state.context.asBackend()
  state.cwd = mkdtempSync(join(tmpdir(), 'mx-enrich-'))
  mkdirSync(join(state.cwd, 'src'), {recursive: true})
  writeFileSync(join(state.cwd, 'src', 'App.tsx'), APP)
  state.stop = startCommentEnrichment(state.db, state.cwd)
}, 60_000)

afterAll(async () => {
  state.stop()
  await state.context?.shutdown()
  await state.runner?.stop()
  rmSync(state.cwd, {recursive: true, force: true})
})

const insertComment = (cid: string, kind: 'source-linked' | 'floating'): Promise<unknown> => {
  const now = new Date()
  const {line, column} = loc('<Widget')
  return state.db
    .insert(app.comments, {
      previewId: 'local',
      sessionId: 'mandarax_enrich',
      cid,
      threadId: cid,
      parts: [{type: 'text', text: cid}],
      authorKind: 'human',
      status: 'open',
      kind,
      anchor: {source: {file: 'src/App.tsx', line, column}},
      createdAt: now,
      updatedAt: now,
    })
    .wait({tier: 'edge'})
}

const waitForHash = async (cid: string): Promise<string | undefined> => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const [row] = await state.db.all(app.comments.where({previewId: 'local', cid}))
    if (row?.anchorHash) return row.anchorHash
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return undefined
}

describe('comment enrichment worker (it) — server enriches direct-written source anchors', () => {
  it('captures an AST hash on a source-linked comment written directly (no tool)', async () => {
    await insertComment('enrich-1', 'source-linked')
    expect(await waitForHash('enrich-1')).toBeTruthy()
  })

  it('leaves a floating comment unenriched (subscription filtered to source-linked)', async () => {
    await insertComment('floating-1', 'floating')
    await insertComment('after-floating', 'source-linked')
    expect(await waitForHash('after-floating')).toBeTruthy()
    const [floating] = await state.db.all(app.comments.where({previewId: 'local', cid: 'floating-1'}))
    expect(floating?.anchorHash).toBeFalsy()
  })

  it('enriches source-linked comments added after startup (incremental deltas)', async () => {
    await insertComment('late-1', 'source-linked')
    expect(await waitForHash('late-1')).toBeTruthy()
    await insertComment('late-2', 'source-linked')
    expect(await waitForHash('late-2')).toBeTruthy()
  })
})
