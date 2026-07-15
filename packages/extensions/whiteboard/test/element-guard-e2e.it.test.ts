import {expect, test} from 'vitest'
import {makeExtRpcClient} from '@conciv/extension'
import type {WhiteboardRouter} from '../src/server/router.js'
import type {ElementRow} from '../src/shared/rows.js'
import {drawRectangle} from './canvas-it-helpers.js'
import {bootCanvas} from './canvas-it-boot.js'

const byId = (rows: ElementRow[], elementId: string): ElementRow | undefined =>
  rows.find((row) => row.elementId === elementId)

const byOwner = (rows: ElementRow[], ownerKind: 'human' | 'ai'): ElementRow | undefined =>
  rows.find((row) => row.ownerKind === ownerKind)

test('ownership is recorded and the AI cannot silently change a human element', async () => {
  const {api, cx, cy} = await bootCanvas()
  const client = makeExtRpcClient<WhiteboardRouter>(api.apiBase, 'whiteboard')
  const liveRows = (): Promise<ElementRow[]> => client.elements.list({room: api.session, scope: 'live'})
  try {
    await drawRectangle(api.page, cx, cy)
    await expect.poll(async () => (await liveRows()).length, {timeout: 15_000}).toBe(1)
    const humanId = byOwner(await liveRows(), 'human')?.elementId ?? ''
    expect(humanId).not.toBe('')

    await api.callTool('canvas.draw', {elements: [{type: 'rectangle', x: 400, y: 400, width: 80, height: 60}]})
    await api.callTool('canvas.commit', {})
    await expect.poll(async () => (await liveRows()).length, {timeout: 15_000}).toBe(2)
    const aiId = byOwner(await liveRows(), 'ai')?.elementId ?? ''
    expect(aiId).not.toBe('')

    const blocked = await api.callTool('canvas.update', {elementId: humanId, patch: {x: 999}})
    expect(blocked).toMatchObject({updated: false, blocked: true})
    const humanAfter = byId(await liveRows(), humanId)
    expect(humanAfter?.lastEditedByKind).toBe('human')
    expect((humanAfter?.data as {x?: number})?.x).not.toBe(999)

    const updated = await api.callTool('canvas.update', {elementId: aiId, patch: {x: 111}})
    expect(updated).toMatchObject({updated: true})
    expect(byId(await liveRows(), aiId)?.lastEditedByKind).toBe('ai')
  } finally {
    await api.dispose()
  }
})
