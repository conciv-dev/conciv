import type {JsonValue} from 'jazz-tools'
import {defineTool, imageResult} from '@conciv/extension'
import {app} from '../../shared/schema.js'
import type {WhiteboardToolContext} from '../../server/context.js'
import {validateSvg} from './svg-caps.js'
import {draftToSvg, type DraftElement} from './draft-svg.js'
import {renderDraftPng} from './preview.js'
import {
  canvasClearDef,
  canvasCommitDef,
  canvasConnectDef,
  canvasDeleteDef,
  canvasDiagramDef,
  canvasDiscardDef,
  canvasDrawDef,
  canvasExportDef,
  canvasPreviewDef,
  canvasReadDef,
  canvasSvgDef,
  canvasUpdateDef,
  type CanvasClearInput,
  type CanvasCommitInput,
  type CanvasConnectInput,
  type CanvasDeleteInput,
  type CanvasDiagramInput,
  type CanvasDiscardInput,
  type CanvasDrawInput,
  type CanvasExportInput,
  type CanvasPreviewInput,
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
  async (input, ctx, request) => {
    const room = ctx.room(request)
    if (input.format === 'json') {
      const table = input.scope === 'draft' ? app.canvasDraftElements : app.canvasElements
      const rows = await ctx.db.all(table.where({room}), {tier: 'global'})
      return {elements: rows.map((row) => row.data)}
    }
    const requestId = crypto.randomUUID()
    await ctx.db
      .insert(app.canvasPending, {room, kind: 'export', stage: 'live', payload: {requestId, scope: input.scope} as JsonValue})
      .wait({tier: 'edge'})
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const replies = await ctx.db.all(app.canvasReplies.where({room, requestId}), {tier: 'global'})
      const reply = replies[0]
      if (reply) {
        const payload = reply.payload as unknown as {dataBase64?: string; error?: string; reason?: string}
        await ctx.db.delete(app.canvasReplies, reply.id).wait({tier: 'edge'})
        if (payload.error) return {error: payload.error, reason: payload.reason ?? 'unknown', scope: input.scope}
        return imageResult('image/png', payload.dataBase64 ?? '', {scope: input.scope})
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('export timed out: no canvas tab is connected (canvas.preview works without one)')
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
    const room = ctx.room(request)
    const [draft] = await ctx.db.all(app.canvasDraftElements.where({room, elementId: input.elementId}), {tier: 'global'})
    const [live] = draft ? [] : await ctx.db.all(app.canvasElements.where({room, elementId: input.elementId}), {tier: 'global'})
    const current = draft ?? live
    if (!current) return {updated: false}
    const table = draft ? app.canvasDraftElements : app.canvasElements
    const data = Object.assign({}, current.data, input.patch) as JsonValue
    await ctx.db.update(table, current.id, {data, version: current.version + 1}).wait({tier: 'edge'})
    return {updated: true}
  },
)

export const canvasDeleteTool = defineTool<typeof CanvasDeleteInput, WhiteboardToolContext>(canvasDeleteDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    const draftHits = await ctx.db.all(app.canvasDraftElements.where({room, elementId: input.elementId}), {tier: 'global'})
    const table = draftHits.length ? app.canvasDraftElements : app.canvasElements
    const rows = draftHits.length
      ? draftHits
      : await ctx.db.all(app.canvasElements.where({room, elementId: input.elementId}), {tier: 'global'})
    const outcomes = await Promise.allSettled(rows.map((row) => ctx.db.delete(table, row.id).wait({tier: 'edge'})))
    const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length
    if (failed) console.error(`[whiteboard] canvas.delete: ${failed} delete(s) failed for ${input.elementId}`)
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

const draftRows = async (ctx: WhiteboardToolContext, room: string) =>
  ctx.db.all(app.canvasDraftElements.where({room}), {tier: 'global'})

export const canvasCommitTool = defineTool<typeof CanvasCommitInput, WhiteboardToolContext>(canvasCommitDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const drafts = await draftRows(ctx, room)
    if (!drafts.length) return {committed: false, reason: 'no draft to commit'}
    await ctx.db
      .insert(app.canvasPending, {room, kind: 'commit', stage: 'live', payload: {} as JsonValue})
      .wait({tier: 'edge'})
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const remaining = await draftRows(ctx, room)
      if (!remaining.length) return {committed: true, elements: drafts.length}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('commit timed out: no canvas tab is connected to perform it')
  },
)

export const canvasDiscardTool = defineTool<typeof CanvasDiscardInput, WhiteboardToolContext>(canvasDiscardDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const drafts = await draftRows(ctx, room)
    const pendings = await ctx.db.all(app.canvasPending.where({room, stage: 'draft'}), {tier: 'global'})
    const outcomes = await Promise.allSettled([
      ...drafts.map((row) => ctx.db.delete(app.canvasDraftElements, row.id).wait({tier: 'edge'})),
      ...pendings.map((row) => ctx.db.delete(app.canvasPending, row.id).wait({tier: 'edge'})),
    ])
    const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length
    if (failed) console.error(`[whiteboard] canvas.discard: ${failed} delete(s) failed`)
    return {discarded: drafts.length - outcomes.slice(0, drafts.length).filter((o) => o.status === 'rejected').length}
  },
)

export const canvasPreviewTool = defineTool<typeof CanvasPreviewInput, WhiteboardToolContext>(canvasPreviewDef).server(
  async (_input, ctx, request) => {
    const rows = await ctx.db.all(app.canvasDraftElements.where({room: ctx.room(request)}), {tier: 'global'})
    if (!rows.length) return {empty: true, reason: 'draft has no elements yet'}
    const elements = rows.map((row) => row.data as unknown as DraftElement)
    const {svg, width, height} = draftToSvg(elements)
    try {
      return imageResult('image/png', await renderDraftPng(svg, width, height), {elements: rows.length})
    } catch (error) {
      console.error(`[whiteboard] canvas.preview render failed: ${String(error)}`)
      return {error: 'preview render failed', reason: String(error), elements: rows.length}
    }
  },
)

export const canvasTools = [
  canvasReadTool,
  canvasSvgTool,
  canvasPreviewTool,
  canvasExportTool,
  canvasDrawTool,
  canvasDiagramTool,
  canvasConnectTool,
  canvasUpdateTool,
  canvasDeleteTool,
  canvasClearTool,
  canvasCommitTool,
  canvasDiscardTool,
]
