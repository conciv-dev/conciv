import type {JsonValue} from 'jazz-tools'
import {defineTool} from '@mandarax/extension'
import {app} from '../../shared/schema.js'
import type {WhiteboardToolContext} from '../../server/context.js'
import {
  canvasClearDef,
  canvasDeleteDef,
  canvasDrawDef,
  canvasReadDef,
  canvasUpdateDef,
  type CanvasClearInput,
  type CanvasDeleteInput,
  type CanvasDrawInput,
  type CanvasReadInput,
  type CanvasUpdateInput,
} from './def.js'

export const canvasReadTool = defineTool<typeof CanvasReadInput, WhiteboardToolContext>(canvasReadDef).server(
  async (_input, ctx, request) => {
    const rows = await ctx.db.all(app.canvasElements.where({room: ctx.room(request)}))
    return {elements: rows.map((row) => row.data)}
  },
)

export const canvasDrawTool = defineTool<typeof CanvasDrawInput, WhiteboardToolContext>(canvasDrawDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    const writes = input.elements.map((element) =>
      ctx.db.insert(app.canvasElements, {room, elementId: crypto.randomUUID(), data: element as JsonValue, version: 1}),
    )
    await Promise.all(writes.map((write) => write.wait({tier: 'edge'})))
    return {drawn: writes.map((write) => write.value.elementId)}
  },
)

export const canvasUpdateTool = defineTool<typeof CanvasUpdateInput, WhiteboardToolContext>(canvasUpdateDef).server(
  async (input, ctx, request) => {
    const [current] = await ctx.db.all(app.canvasElements.where({room: ctx.room(request), elementId: input.elementId}))
    if (!current) return {updated: false}
    const data = Object.assign({}, current.data, input.patch) as JsonValue
    await ctx.db.update(app.canvasElements, current.id, {data, version: current.version + 1}).wait({tier: 'edge'})
    return {updated: true}
  },
)

export const canvasDeleteTool = defineTool<typeof CanvasDeleteInput, WhiteboardToolContext>(canvasDeleteDef).server(
  async (input, ctx, request) => {
    const rows = await ctx.db.all(app.canvasElements.where({room: ctx.room(request), elementId: input.elementId}))
    await Promise.all(rows.map((row) => ctx.db.delete(app.canvasElements, row.id).wait({tier: 'edge'})))
    return {deleted: input.elementId}
  },
)

export const canvasClearTool = defineTool<typeof CanvasClearInput, WhiteboardToolContext>(canvasClearDef).server(
  async (_input, ctx, request) => {
    const rows = await ctx.db.all(app.canvasElements.where({room: ctx.room(request)}))
    await Promise.all(rows.map((row) => ctx.db.delete(app.canvasElements, row.id).wait({tier: 'edge'})))
    return {cleared: rows.length}
  },
)

export const canvasTools = [canvasReadTool, canvasDrawTool, canvasUpdateTool, canvasDeleteTool, canvasClearTool]
