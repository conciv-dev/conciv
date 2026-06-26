import {fileURLToPath} from 'node:url'
import {createJazzContext, type Db, type JazzContext} from 'jazz-tools/backend'
import {deploy} from 'jazz-tools/dev'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {startJazzRunner, type JazzRunner} from '../src/server/jazz/runner.js'
import {app} from '../src/shared/schema.js'
import permissions from '../src/shared/permissions.js'
import {roomId} from '../src/shared/room.js'
import {
  canvasClearDef,
  canvasConnectDef,
  canvasDeleteDef,
  canvasDiagramDef,
  canvasDrawDef,
} from '../src/tool/canvas/def.js'
import {
  canvasClearTool,
  canvasConnectTool,
  canvasDeleteTool,
  canvasDiagramTool,
  canvasDrawTool,
  canvasUpdateTool,
} from '../src/tool/canvas/server.js'
import type {WhiteboardToolContext} from '../src/server/context.js'

const schemaDir = fileURLToPath(new URL('../src/shared', import.meta.url))
const request = (label: string) => ({previewId: 'local', sessionId: `mandarax_${label}`})

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
  state.ctx = {cwd: process.cwd(), db, room: (req) => roomId(req.previewId, req.sessionId)}
}, 60_000)

afterAll(async () => {
  await state.context?.shutdown()
  await state.runner?.stop()
})

describe('whiteboard canvas tools (it) — AI enqueues pending draws via the backend db', () => {
  it('canvas.draw enqueues a skeletons pending request scoped to the room (G1)', async () => {
    await canvasDrawTool.__execute!(
      {elements: [{type: 'rectangle', x: 0, y: 0, width: 100, height: 100}]},
      state.ctx,
      request('draw'),
    )
    const room = roomId('local', 'mandarax_draw')
    const pending = await state.ctx.db.all(app.canvasPending.where({room}))
    expect(pending).toHaveLength(1)
    expect(pending[0]!.kind).toBe('skeletons')
    expect((pending[0]!.payload as {elements: unknown[]}).elements).toHaveLength(1)
    const other = await state.ctx.db.all(app.canvasPending.where({room: roomId('local', 'mandarax_elsewhere')}))
    expect(other).toHaveLength(0)
  })

  it('canvas.diagram enqueues a mermaid pending request', async () => {
    await canvasDiagramTool.__execute!({mermaid: 'graph TD; A-->B'}, state.ctx, request('diagram'))
    const pending = await state.ctx.db.all(app.canvasPending.where({room: roomId('local', 'mandarax_diagram')}))
    expect(pending).toHaveLength(1)
    expect(pending[0]!.kind).toBe('mermaid')
    expect((pending[0]!.payload as {source: string}).source).toContain('A-->B')
  })

  it('canvas.connect enqueues a binding arrow', async () => {
    await canvasConnectTool.__execute!({fromId: 'a', toId: 'b'}, state.ctx, request('connect'))
    const pending = await state.ctx.db.all(app.canvasPending.where({room: roomId('local', 'mandarax_connect')}))
    expect(pending).toHaveLength(1)
    expect((pending[0]!.payload as {elements: {type: string}[]}).elements[0]!.type).toBe('arrow')
  })

  it('canvas.update patches an existing element, canvas.delete removes it', async () => {
    const room = roomId('local', 'mandarax_edit')
    await state.ctx.db
      .insert(app.canvasElements, {room, elementId: 'el-1', data: {type: 'rectangle'}, version: 1})
      .wait({tier: 'edge'})
    await canvasUpdateTool.__execute!({elementId: 'el-1', patch: {x: 5}}, state.ctx, request('edit'))
    const [updated] = await state.ctx.db.all(app.canvasElements.where({room, elementId: 'el-1'}))
    expect((updated!.data as {x: number}).x).toBe(5)
    await canvasDeleteTool.__execute!({elementId: 'el-1'}, state.ctx, request('edit'))
    expect(await state.ctx.db.all(app.canvasElements.where({room, elementId: 'el-1'}))).toHaveLength(0)
  })

  it('canvas.clear removes both elements and pending requests', async () => {
    const room = roomId('local', 'mandarax_clear')
    await state.ctx.db
      .insert(app.canvasElements, {room, elementId: 'el-c', data: {type: 'ellipse'}, version: 1})
      .wait({tier: 'edge'})
    await canvasDrawTool.__execute!({elements: [{type: 'diamond', x: 0, y: 0}]}, state.ctx, request('clear'))
    await canvasClearTool.__execute!({}, state.ctx, request('clear'))
    expect(await state.ctx.db.all(app.canvasElements.where({room}))).toHaveLength(0)
    expect(await state.ctx.db.all(app.canvasPending.where({room}))).toHaveLength(0)
  })

  it('declares destructive canvas tools as approval:ask (G2)', () => {
    expect(canvasDeleteDef.approval).toBe('ask')
    expect(canvasClearDef.approval).toBe('ask')
    expect(canvasDrawDef.approval).toBeUndefined()
    expect(canvasDiagramDef.approval).toBeUndefined()
    expect(canvasConnectDef.approval).toBeUndefined()
  })
})
