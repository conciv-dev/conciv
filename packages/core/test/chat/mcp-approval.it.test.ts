import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {approvalIds, type Kit} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'

const canvasDelete = defineTool({
  name: 'canvas.delete',
  description: 'Remove an element from the canvas by elementId.',
  inputSchema: z.object({elementId: z.string()}),
  approval: 'ask',
}).server((input) => ({removed: input.elementId}))

const canvasDraw = defineTool({
  name: 'canvas.draw',
  description: 'Draw an element on the canvas.',
  inputSchema: z.object({elementId: z.string()}),
}).server((input) => ({drew: input.elementId}))

const whiteboardish = defineExtension({name: 'whiteboardish', tools: [canvasDelete, canvasDraw]})

async function bootWhiteboardish(): Promise<{kit: Kit; session: string}> {
  const kit = await bootKit({extensions: [whiteboardish]})
  const session = await kit.session()
  return {kit, session}
}

describe('/api/mcp gates risky tools', () => {
  it('holds a risky call until the user approves, then runs it', async () => {
    const {kit, session} = await bootWhiteboardish()
    try {
      const stream = await kit.attach(session)
      const settled = {done: false}
      const pending = kit.callTool('canvas.delete', {elementId: 'e1'}, session)
      const outcome = pending.then(
        (value) => {
          settled.done = true
          return value
        },
        (error: unknown) => {
          settled.done = true
          throw error
        },
      )
      const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 10_000})
      expect(settled.done).toBe(false)
      const approvalId = approvalIds(asked)[0]
      if (approvalId === undefined) throw new Error('no approval id in the snapshot')
      await kit.rpc.chat.permissionDecision({approvalId, approved: true})
      expect(JSON.stringify(await outcome)).toContain('e1')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('fails a risky call the user denies', async () => {
    const {kit, session} = await bootWhiteboardish()
    try {
      const stream = await kit.attach(session)
      const pending = kit.callTool('canvas.delete', {elementId: 'e2'}, session).then(
        (value) => ({ok: true as const, value}),
        (error: unknown) => ({ok: false as const, message: String(error)}),
      )
      const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 10_000})
      const approvalId = approvalIds(asked)[0]
      if (approvalId === undefined) throw new Error('no approval id in the snapshot')
      await kit.rpc.chat.permissionDecision({approvalId, approved: false})
      const outcome = await pending
      expect(outcome.ok).toBe(false)
      expect(outcome.ok ? '' : outcome.message).toContain('denied')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('runs a tool that needs no approval without asking', async () => {
    const {kit, session} = await bootWhiteboardish()
    try {
      const result = await kit.callTool('canvas.draw', {elementId: 'e3'}, session)
      expect(JSON.stringify(result)).toContain('e3')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('refuses a risky call that carries no session to ask in', async () => {
    const kit = await bootKit({extensions: [whiteboardish]})
    try {
      const outcome = await kit.callTool('canvas.delete', {elementId: 'e4'}, '').then(
        (value) => ({ok: true as const, value}),
        (error: unknown) => ({ok: false as const, message: String(error)}),
      )
      expect(outcome.ok).toBe(false)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
