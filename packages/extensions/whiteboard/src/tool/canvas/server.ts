import type {JsonValue} from 'jazz-tools'
import {defineTool} from '@conciv/extension'
import {app} from '../../shared/schema.js'
import type {WhiteboardToolContext} from '../../server/context.js'
import {validateSvg} from './svg-caps.js'
import {
  canvasClearDef,
  canvasConnectDef,
  canvasDeleteDef,
  canvasDiagramDef,
  canvasDrawDef,
  canvasExportDef,
  canvasReadDef,
  canvasSvgDef,
  canvasUpdateDef,
  type CanvasClearInput,
  type CanvasConnectInput,
  type CanvasDeleteInput,
  type CanvasDiagramInput,
  type CanvasDrawInput,
  type CanvasExportInput,
  type CanvasReadInput,
  type CanvasSvgInput,
  type CanvasUpdateInput,
} from './def.js'

const MAX_EDGES = 500
const EDGE_PATTERN = /--+>|--+|-\.-+>|==+>|--[xo]/g

export const canvasReadTool = defineTool<typeof CanvasReadInput, WhiteboardToolContext>(canvasReadDef).server(
  async (input, ctx, request) => {
    const table = input.scope === 'draft' ? app.canvasDraftElements : app.canvasElements
    const rows = await ctx.db.all(table.where({room: ctx.room(request)}), {tier: 'global'})
    return {elements: rows.map((row) => row.data), scope: input.scope}
  },
)

export const canvasSvgTool = defineTool<typeof CanvasSvgInput, WhiteboardToolContext>(canvasSvgDef).server(
  async (input, ctx, request) => {
    validateSvg(input.svg)
    const write = ctx.db.insert(app.canvasPending, {
      room: ctx.room(request),
      kind: 'svg',
      stage: 'draft',
      payload: {svg: input.svg, x: input.x, y: input.y, width: input.width ?? 400, roughness: input.roughness} as JsonValue,
    })
    await write.wait({tier: 'edge'})
    return {pending: write.value.id}
  },
)

export const canvasExportTool = defineTool<typeof CanvasExportInput, WhiteboardToolContext>(canvasExportDef).server(
  async (_input, ctx, request) => {
    const rows = await ctx.db.all(app.canvasElements.where({room: ctx.room(request)}), {tier: 'global'})
    return {elements: rows.map((row) => row.data)}
  },
)

export const canvasDrawTool = defineTool<typeof CanvasDrawInput, WhiteboardToolContext>(canvasDrawDef).server(
  async (input, ctx, request) => {
    const write = ctx.db.insert(app.canvasPending, {
      room: ctx.room(request),
      kind: 'skeletons',
      stage: 'draft',
      payload: {elements: input.elements} as JsonValue,
    })
    await write.wait({tier: 'edge'})
    return {pending: write.value.id}
  },
)

export const canvasDiagramTool = defineTool<typeof CanvasDiagramInput, WhiteboardToolContext>(canvasDiagramDef).server(
  async (input, ctx, request) => {
    const edges = (input.mermaid.match(EDGE_PATTERN) ?? []).length
    if (edges > MAX_EDGES) throw new Error(`diagram exceeds ${MAX_EDGES} edges`)
    const write = ctx.db.insert(app.canvasPending, {
      room: ctx.room(request),
      kind: 'mermaid',
      stage: 'draft',
      payload: {source: input.mermaid} as JsonValue,
    })
    await write.wait({tier: 'edge'})
    return {pending: write.value.id}
  },
)

export const canvasConnectTool = defineTool<typeof CanvasConnectInput, WhiteboardToolContext>(canvasConnectDef).server(
  async (input, ctx, request) => {
    const write = ctx.db.insert(app.canvasPending, {
      room: ctx.room(request),
      kind: 'skeletons',
      stage: 'draft',
      payload: {elements: [{type: 'arrow', x: 0, y: 0, start: {id: input.fromId}, end: {id: input.toId}}]} as JsonValue,
    })
    await write.wait({tier: 'edge'})
    return {pending: write.value.id}
  },
)

export const canvasUpdateTool = defineTool<typeof CanvasUpdateInput, WhiteboardToolContext>(canvasUpdateDef).server(
  async (input, ctx, request) => {
    const [current] = await ctx.db.all(
      app.canvasElements.where({room: ctx.room(request), elementId: input.elementId}),
      {tier: 'global'},
    )
    if (!current) return {updated: false}
    const data = Object.assign({}, current.data, input.patch) as JsonValue
    await ctx.db.update(app.canvasElements, current.id, {data, version: current.version + 1}).wait({tier: 'edge'})
    return {updated: true}
  },
)

export const canvasDeleteTool = defineTool<typeof CanvasDeleteInput, WhiteboardToolContext>(canvasDeleteDef).server(
  async (input, ctx, request) => {
    const rows = await ctx.db.all(app.canvasElements.where({room: ctx.room(request), elementId: input.elementId}), {
      tier: 'global',
    })
    await Promise.all(rows.map((row) => ctx.db.delete(app.canvasElements, row.id).wait({tier: 'edge'})))
    return {deleted: input.elementId}
  },
)

export const canvasClearTool = defineTool<typeof CanvasClearInput, WhiteboardToolContext>(canvasClearDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const elements = await ctx.db.all(app.canvasElements.where({room}), {tier: 'global'})
    const pending = await ctx.db.all(app.canvasPending.where({room}), {tier: 'global'})
    await Promise.all([
      ...elements.map((row) => ctx.db.delete(app.canvasElements, row.id).wait({tier: 'edge'})),
      ...pending.map((row) => ctx.db.delete(app.canvasPending, row.id).wait({tier: 'edge'})),
    ])
    return {cleared: elements.length}
  },
)

export const canvasTools = [
  canvasReadTool,
  canvasSvgTool,
  canvasExportTool,
  canvasDrawTool,
  canvasDiagramTool,
  canvasConnectTool,
  canvasUpdateTool,
  canvasDeleteTool,
  canvasClearTool,
]
