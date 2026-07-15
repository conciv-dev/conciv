import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import type {ToolRequest} from '@conciv/extension'
import {createStore, type Store} from '../src/server/db/store.js'
import type {ElementRow} from '../src/shared/rows.js'
import type {WhiteboardToolContext} from '../src/server/context.js'
import {canvasTools} from '../src/tool/canvas/server.js'
import {elementRowFixture} from './canvas-it-helpers.js'

const stores: Store[] = []
const open = async (): Promise<Store> => {
  const store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-guard-'))))
  stores.push(store)
  return store
}
afterEach(() => stores.splice(0).forEach((store) => store.close()))

const el = (kind: 'human' | 'ai'): ElementRow =>
  elementRowFixture({
    room: 'r',
    elementId: 'e1',
    data: {n: 1},
    version: 1,
    ownerKind: kind,
    ownerName: kind === 'human' ? 'Guest 00' : null,
    ownerModel: kind === 'ai' ? 'opus' : null,
    lastEditedByKind: kind,
    lastEditedByModel: kind === 'ai' ? 'opus' : null,
  })

const request: ToolRequest = {sessionId: 's', model: 'opus'}

const contextFor = (store: Store, approve: () => boolean, calls: {n: number}): WhiteboardToolContext => ({
  cwd: '/workspace',
  store,
  sessionId: () => 's',
  room: () => 'r',
  model: () => 'opus',
  requestApproval: async () => {
    calls.n += 1
    return approve()
  },
})

const toolFor = (name: string) => {
  const tool = canvasTools.find((candidate) => candidate.name === name)
  if (!tool?.__execute) throw new Error(`tool ${name} has no execute`)
  return tool.__execute
}

const deniedHumanContext = async () => {
  const store = await open()
  await store.upsertElement('live', el('human'))
  const calls = {n: 0}
  return {store, calls, ctx: contextFor(store, () => false, calls)}
}

describe('canvas edit approval guard', () => {
  it('blocks an AI update of a human element when approval is denied', async () => {
    const {store, calls, ctx} = await deniedHumanContext()
    const result = await toolFor('canvas.update')({elementId: 'e1', patch: {n: 2}}, ctx, request)
    expect(result).toEqual({updated: false, blocked: true})
    expect(calls.n).toBe(1)
    const rows = await store.listElements('live', 'r')
    expect(rows[0]?.version).toBe(1)
    expect(rows[0]?.data).toEqual({n: 1})
  })

  it('allows an AI update of a human element when approved and flips lastEditedBy', async () => {
    const store = await open()
    await store.upsertElement('live', el('human'))
    const calls = {n: 0}
    const ctx = contextFor(store, () => true, calls)
    const result = await toolFor('canvas.update')({elementId: 'e1', patch: {n: 2}}, ctx, request)
    expect(result).toEqual({updated: true})
    const rows = await store.listElements('live', 'r')
    expect(rows[0]?.ownerKind).toBe('human')
    expect(rows[0]?.lastEditedByKind).toBe('ai')
    expect(rows[0]?.version).toBe(2)
  })

  it('updates an AI-owned element without asking for approval', async () => {
    const store = await open()
    await store.upsertElement('live', el('ai'))
    const calls = {n: 0}
    const ctx = contextFor(store, () => false, calls)
    const result = await toolFor('canvas.update')({elementId: 'e1', patch: {n: 2}}, ctx, request)
    expect(result).toEqual({updated: true})
    expect(calls.n).toBe(0)
  })

  it('blocks deleting a human element when approval is denied', async () => {
    const {store, calls, ctx} = await deniedHumanContext()
    const result = await toolFor('canvas.delete')({elementId: 'e1'}, ctx, request)
    expect(result).toEqual({deleted: null, blocked: true})
    expect(calls.n).toBe(1)
    expect(await store.listElements('live', 'r')).toHaveLength(1)
  })

  it('blocks clearing a canvas with human elements when approval is denied', async () => {
    const {store, calls, ctx} = await deniedHumanContext()
    const result = await toolFor('canvas.clear')({}, ctx, request)
    expect(result).toEqual({cleared: 0, blocked: true})
    expect(calls.n).toBe(1)
    expect(await store.listElements('live', 'r')).toHaveLength(1)
  })
})
