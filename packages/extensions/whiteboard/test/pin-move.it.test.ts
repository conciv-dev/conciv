import {fileURLToPath} from 'node:url'
import {createJazzContext, type Db, type JazzContext} from 'jazz-tools/backend'
import {deploy} from 'jazz-tools/dev'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {startJazzRunner, type JazzRunner} from '../src/server/jazz/runner.js'
import {app} from '../src/shared/schema.js'
import permissions from '../src/shared/permissions.js'
import {roomId} from '../src/shared/room.js'
import {commentCreateTool, commentMoveTool, pinSetStateTool} from '../src/tool/comment/server.js'
import type {WhiteboardToolContext} from '../src/server/context.js'

const schemaDir = fileURLToPath(new URL('../src/shared', import.meta.url))
const request = {previewId: 'local', sessionId: 'mandarax_pinmove'}
const room = roomId(request.previewId, request.sessionId)

const state: {runner: JazzRunner; context: JazzContext; ctx: WhiteboardToolContext} = {
  runner: undefined as never,
  context: undefined as never,
  ctx: undefined as never,
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
  const db: Db = state.context.asBackend()
  state.ctx = {cwd: process.cwd(), db, room: () => room}
}, 60_000)

afterAll(async () => {
  await state.context?.shutdown()
  await state.runner?.stop()
})

const pin = async (cid: string) => (await state.ctx.db.all(app.pins.where({room, cid})))[0]

describe('comment.move / pin.setState (it) — agent pin geometry control', () => {
  it('moves a pin and flips its state, preserving the rest of the geometry', async () => {
    const cid = crypto.randomUUID()
    await commentCreateTool.__execute!(
      {
        cid,
        kind: 'floating',
        parts: [{type: 'text', text: 'drag me'}],
        x: 100,
        y: 100,
        elementId: 'el-1',
        authorKind: 'ai',
      },
      state.ctx,
      request,
    )
    expect(await pin(cid)).toMatchObject({x: 100, y: 100, pinState: 'locked', elementId: 'el-1'})

    await commentMoveTool.__execute!({cid, x: 250, y: 320}, state.ctx, request)
    expect(await pin(cid)).toMatchObject({x: 250, y: 320, pinState: 'locked', elementId: 'el-1'})

    await pinSetStateTool.__execute!({cid, pinState: 'offset'}, state.ctx, request)
    expect(await pin(cid)).toMatchObject({x: 250, y: 320, pinState: 'offset', elementId: 'el-1'})
  })
})
