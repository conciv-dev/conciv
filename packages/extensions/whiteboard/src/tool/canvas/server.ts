import {and, eq} from 'drizzle-orm'
import {defineTool, imageResult, toolError} from '@conciv/extension'
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
} from './def.js'

const MAX_EDGES = 500
const EDGE_PATTERN = /--+>|--+|-\.-+>|==+>|--[xo]/g

const canvasReadTool = defineTool(canvasReadDef).server(async (input, ctx: WhiteboardToolContext, request) => {
  const rows = await ctx.store.listElements(input.scope, ctx.room(request))
  return {elements: rows.map((row) => row.data), scope: input.scope}
})

const canvasSvgTool = defineTool(canvasSvgDef).server(async (input, ctx: WhiteboardToolContext, request) => {
  try {
    validateSvg(input.svg)
  } catch (error) {
    throw toolError('INVALID_SVG', {message: error instanceof Error ? error.message : String(error)})
  }
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
})

const canvasExportTool = defineTool(canvasExportDef).server(async (input, ctx: WhiteboardToolContext, request) => {
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
      await ctx.store.deleteReply(reply.id, room)
      if (payload.error) return {error: payload.error, reason: payload.reason ?? 'unknown', scope: input.scope}
      return imageResult('image/png', payload.dataBase64 ?? '', {scope: input.scope})
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw toolError('EXPORT_TIMEOUT', {
    message: 'export timed out: no canvas tab is connected (canvas.preview works without one)',
  })
})

const canvasDrawTool = defineTool(canvasDrawDef).server(async (input, ctx: WhiteboardToolContext, request) => {
  const pending = await ctx.store.insertPending({
    id: crypto.randomUUID(),
    room: ctx.room(request),
    kind: 'skeletons',
    stage: 'draft',
    payload: {elements: input.elements} as JsonValue,
  })
  return {pending: pending.id}
})

const canvasDiagramTool = defineTool(canvasDiagramDef).server(async (input, ctx: WhiteboardToolContext, request) => {
  const edges = (input.mermaid.match(EDGE_PATTERN) ?? []).length
  if (edges > MAX_EDGES) throw toolError('DIAGRAM_TOO_LARGE', {message: `diagram exceeds ${MAX_EDGES} edges`})
  const pending = await ctx.store.insertPending({
    id: crypto.randomUUID(),
    room: ctx.room(request),
    kind: 'mermaid',
    stage: 'draft',
    payload: {source: input.mermaid},
  })
  return {pending: pending.id}
})

const canvasConnectTool = defineTool(canvasConnectDef).server(async (input, ctx: WhiteboardToolContext, request) => {
  const pending = await ctx.store.insertPending({
    id: crypto.randomUUID(),
    room: ctx.room(request),
    kind: 'skeletons',
    stage: 'draft',
    payload: {elements: [{type: 'arrow', x: 0, y: 0, start: {id: input.fromId}, end: {id: input.toId}}]},
  })
  return {pending: pending.id}
})

const canvasUpdateTool = defineTool(canvasUpdateDef).server(async (input, ctx: WhiteboardToolContext, request) => {
  const room = ctx.room(request)
  const draft = (await ctx.store.listElements('draft', room)).find((row) => row.elementId === input.elementId)
  const live = draft
    ? undefined
    : (await ctx.store.listElements('live', room)).find((row) => row.elementId === input.elementId)
  const current = draft ?? live
  if (!current) return {updated: false}
  const scope = draft ? 'draft' : 'live'
  const data = Object.assign({}, current.data, input.patch) as JsonValue
  await ctx.store.upsertElement(scope, {room, elementId: input.elementId, data, version: current.version + 1})
  return {updated: true}
})

const canvasDeleteTool = defineTool(canvasDeleteDef).server(async (input, ctx: WhiteboardToolContext, request) => {
  const room = ctx.room(request)
  const draftHit = (await ctx.store.listElements('draft', room)).some((row) => row.elementId === input.elementId)
  const scope = draftHit ? 'draft' : 'live'
  await ctx.store.deleteElement(scope, room, input.elementId)
  return {deleted: input.elementId}
})

const canvasClearTool = defineTool(canvasClearDef).server(async (_input, ctx: WhiteboardToolContext, request) => {
  const room = ctx.room(request)
  const elements = await ctx.store.listElements('live', room)
  await ctx.store.deleteElements(
    'live',
    room,
    elements.map((row) => row.elementId),
  )
  for (const row of await ctx.store.db.select().from(canvasPending).where(eq(canvasPending.room, room)))
    await ctx.store.deletePending(row.id, room)
  return {cleared: elements.length}
})

const canvasCommitTool = defineTool(canvasCommitDef).server(async (_input, ctx: WhiteboardToolContext, request) => {
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
  throw toolError('COMMIT_TIMEOUT', {message: 'commit timed out: no canvas tab is connected to perform it'})
})

const canvasDiscardTool = defineTool(canvasDiscardDef).server(async (_input, ctx: WhiteboardToolContext, request) => {
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
    for (const row of pendings) await ctx.store.deletePending(row.id, room)
    return {discarded: drafts.length}
  } catch (error) {
    console.error(`[whiteboard] canvas.discard failed: ${String(error)}`)
    return {discarded: 0, error: 'discard failed', reason: String(error)}
  }
})

const canvasPreviewTool = defineTool(canvasPreviewDef).server(async (_input, ctx: WhiteboardToolContext, request) => {
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
})

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
