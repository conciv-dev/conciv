import {and, eq} from 'drizzle-orm'
import {defineTool, imageResult} from '@conciv/extension'
import type {JsonValue} from '../../shared/rows.js'
import {canvasPending, canvasReplies} from '../../server/db/schema.js'
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

const canvasReadTool = defineTool<typeof CanvasReadInput, WhiteboardToolContext>(canvasReadDef).server(
  async (input, ctx, request) => {
    const rows = await ctx.store.listElements(input.scope, ctx.room(request))
    return {elements: rows.map((row) => row.data), scope: input.scope}
  },
)

const canvasSvgTool = defineTool<typeof CanvasSvgInput, WhiteboardToolContext>(canvasSvgDef).server(
  async (input, ctx, request) => {
    validateSvg(input.svg)
    const pending = await ctx.store.insertPending({
      id: crypto.randomUUID(),
      room: ctx.room(request),
      kind: 'svg',
      stage: 'draft',
      payload: {
        svg: input.svg,
        x: input.x,
        y: input.y,
        width: input.width ?? 400,
        roughness: input.roughness,
      } as JsonValue,
    })
    return {pending: pending.id}
  },
)

const canvasExportTool = defineTool<typeof CanvasExportInput, WhiteboardToolContext>(canvasExportDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    if (input.format === 'json') {
      const rows = await ctx.store.listElements(input.scope === 'draft' ? 'draft' : 'live', room)
      return {elements: rows.map((row) => row.data)}
    }
    const requestId = crypto.randomUUID()
    await ctx.store.insertPending({
      id: crypto.randomUUID(),
      room,
      kind: 'export',
      stage: 'live',
      payload: {requestId, scope: input.scope},
    })
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const [reply] = await ctx.store.db
        .select()
        .from(canvasReplies)
        .where(and(eq(canvasReplies.room, room), eq(canvasReplies.requestId, requestId)))
      if (reply) {
        const payload = reply.payload as unknown as {dataBase64?: string; error?: string; reason?: string}
        await ctx.store.deleteReply(reply.id)
        if (payload.error) return {error: payload.error, reason: payload.reason ?? 'unknown', scope: input.scope}
        return imageResult('image/png', payload.dataBase64 ?? '', {scope: input.scope})
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('export timed out: no canvas tab is connected (canvas.preview works without one)')
  },
)

const canvasDrawTool = defineTool<typeof CanvasDrawInput, WhiteboardToolContext>(canvasDrawDef).server(
  async (input, ctx, request) => {
    const pending = await ctx.store.insertPending({
      id: crypto.randomUUID(),
      room: ctx.room(request),
      kind: 'skeletons',
      stage: 'draft',
      payload: {elements: input.elements} as JsonValue,
    })
    return {pending: pending.id}
  },
)

const canvasDiagramTool = defineTool<typeof CanvasDiagramInput, WhiteboardToolContext>(canvasDiagramDef).server(
  async (input, ctx, request) => {
    const edges = (input.mermaid.match(EDGE_PATTERN) ?? []).length
    if (edges > MAX_EDGES) throw new Error(`diagram exceeds ${MAX_EDGES} edges`)
    const pending = await ctx.store.insertPending({
      id: crypto.randomUUID(),
      room: ctx.room(request),
      kind: 'mermaid',
      stage: 'draft',
      payload: {source: input.mermaid},
    })
    return {pending: pending.id}
  },
)

const canvasConnectTool = defineTool<typeof CanvasConnectInput, WhiteboardToolContext>(canvasConnectDef).server(
  async (input, ctx, request) => {
    const pending = await ctx.store.insertPending({
      id: crypto.randomUUID(),
      room: ctx.room(request),
      kind: 'skeletons',
      stage: 'draft',
      payload: {elements: [{type: 'arrow', x: 0, y: 0, start: {id: input.fromId}, end: {id: input.toId}}]},
    })
    return {pending: pending.id}
  },
)

const canvasUpdateTool = defineTool<typeof CanvasUpdateInput, WhiteboardToolContext>(canvasUpdateDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    const draft = (await ctx.store.listElements('draft', room)).find((row) => row.elementId === input.elementId)
    const live = draft
      ? undefined
      : (await ctx.store.listElements('live', room)).find((row) => row.elementId === input.elementId)
    const current = draft ?? live
    if (!current) return {updated: false}
    if (current.ownerKind === 'human' && !(await ctx.requestApproval(request, {toolName: 'canvas.update', input})))
      return {updated: false, blocked: true}
    const scope = draft ? 'draft' : 'live'
    const data = Object.assign({}, current.data, input.patch) as JsonValue
    await ctx.store.upsertElement(scope, {
      ...current,
      data,
      version: current.version + 1,
      lastEditedByKind: 'ai',
      lastEditedById: null,
      lastEditedByName: null,
      lastEditedByModel: ctx.model(request),
    })
    return {updated: true}
  },
)

const canvasDeleteTool = defineTool<typeof CanvasDeleteInput, WhiteboardToolContext>(canvasDeleteDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    const draftHit = (await ctx.store.listElements('draft', room)).find((row) => row.elementId === input.elementId)
    const current =
      draftHit ?? (await ctx.store.listElements('live', room)).find((row) => row.elementId === input.elementId)
    if (!current) return {deleted: null}
    if (current.ownerKind === 'human' && !(await ctx.requestApproval(request, {toolName: 'canvas.delete', input})))
      return {deleted: null, blocked: true}
    const scope = draftHit ? 'draft' : 'live'
    await ctx.store.deleteElement(scope, room, input.elementId)
    return {deleted: input.elementId}
  },
)

const canvasClearTool = defineTool<typeof CanvasClearInput, WhiteboardToolContext>(canvasClearDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const elements = await ctx.store.listElements('live', room)
    const hasHuman = elements.some((row) => row.ownerKind === 'human')
    if (hasHuman && !(await ctx.requestApproval(request, {toolName: 'canvas.clear', input: {}})))
      return {cleared: 0, blocked: true}
    await ctx.store.deleteElements(
      'live',
      room,
      elements.map((row) => row.elementId),
    )
    for (const row of await ctx.store.db.select().from(canvasPending).where(eq(canvasPending.room, room)))
      await ctx.store.deletePending(row.id)
    return {cleared: elements.length}
  },
)

const canvasCommitTool = defineTool<typeof CanvasCommitInput, WhiteboardToolContext>(canvasCommitDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const drafts = await ctx.store.listElements('draft', room)
    if (!drafts.length) return {committed: false, reason: 'no draft to commit'}
    await ctx.store.insertPending({id: crypto.randomUUID(), room, kind: 'commit', stage: 'live', payload: {}})
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const remaining = await ctx.store.listElements('draft', room)
      if (!remaining.length) return {committed: true, elements: drafts.length}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('commit timed out: no canvas tab is connected to perform it')
  },
)

const canvasDiscardTool = defineTool<typeof CanvasDiscardInput, WhiteboardToolContext>(canvasDiscardDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const drafts = await ctx.store.listElements('draft', room)
    const pendings = await ctx.store.db
      .select()
      .from(canvasPending)
      .where(and(eq(canvasPending.room, room), eq(canvasPending.stage, 'draft')))
    try {
      await ctx.store.deleteElements(
        'draft',
        room,
        drafts.map((row) => row.elementId),
      )
      for (const row of pendings) await ctx.store.deletePending(row.id)
      return {discarded: drafts.length}
    } catch (error) {
      console.error(`[whiteboard] canvas.discard failed: ${String(error)}`)
      return {discarded: 0, error: 'discard failed', reason: String(error)}
    }
  },
)

const canvasPreviewTool = defineTool<typeof CanvasPreviewInput, WhiteboardToolContext>(canvasPreviewDef).server(
  async (_input, ctx, request) => {
    const rows = await ctx.store.listElements('draft', ctx.room(request))
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
