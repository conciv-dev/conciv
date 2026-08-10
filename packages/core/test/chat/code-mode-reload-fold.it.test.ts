import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {EventType} from '@tanstack/ai'
import type {PageOutcome} from '@conciv/protocol/page-types'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'
import {connectWidget, type FakeWidget} from '../helpers/fake-widget.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function side(kind: ElementCaptureKind): ElementCapture {
  return {
    kind,
    ts: 1,
    descriptor: {tagName: 'input', selectorPath: '#email', role: 'textbox', value: '***'},
    node: {type: 2, tagName: 'input', attributes: {value: '***'}, childNodes: [], id: 7},
  }
}

function answerFor(name: string): PageOutcome {
  if (name === 'page.fill') {
    return {ok: true, result: {ok: true, value: 'a@b.c'}, capture: {before: side('before'), after: side('after')}}
  }
  return {ok: true, result: {text: 'ok'}}
}

const MessageWithPartsSchema = z.object({parts: z.array(z.unknown())}).loose()
const ToolCallPartSchema = z.object({type: z.literal('tool-call'), id: z.string(), name: z.string()}).loose()

function toolCallPartsOf(messages: readonly unknown[]): {id: string; name: string}[] {
  return messages.flatMap((message) => {
    const parsedMessage = MessageWithPartsSchema.safeParse(message)
    if (!parsedMessage.success) return []
    return parsedMessage.data.parts.flatMap((part) => {
      const parsedPart = ToolCallPartSchema.safeParse(part)
      return parsedPart.success ? [parsedPart.data] : []
    })
  })
}

function callThroughCatalog(name: string, input: unknown): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    if (typeof call !== 'function') throw new Error('binding missing: ' + found.call)
    return await call(${JSON.stringify(input)})
  `
}

async function bootScripted(): Promise<{kit: Kit; harness: TestHarness}> {
  const harness = createTestHarness(requireClaude())
  const kit = await bootKit({}, harness)
  cleanups.push(() => kit.cleanup())
  return {kit, harness}
}

async function bootWidget(kit: Kit): Promise<FakeWidget> {
  const widget = await connectWidget(kit, answerFor)
  cleanups.push(async () => widget.end())
  return widget
}

describe('a code-mode page-tool part surviving reload after a later turn', () => {
  it('the synthetic page.fill tool-call part is still in the snapshot once a second turn has run', async () => {
    const {kit, harness} = await bootScripted()
    await bootWidget(kit)
    const sessionId = await kit.session()

    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: callThroughCatalog('page.fill', {selector: '#email', value: 'a@b.c'}),
    })
    const firstStream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'reload-fold-1', sessionId, text: 'fill it in'})
    await firstStream.done({hangGuardMs: 15_000})

    const captures = await kit.rpc.captures.list({sessionId})
    expect(captures.captures.length).toBeGreaterThan(0)
    const toolCallId = captures.captures[0]?.toolCallId
    if (toolCallId === undefined) throw new Error('no capture toolCallId recorded')

    const secondStream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'reload-fold-2', sessionId, text: 'thanks, that is all'})
    await secondStream.done({hangGuardMs: 15_000})

    const reattached = await kit.attach(sessionId)
    const snapshotChunk = await reattached.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {
      hangGuardMs: 5_000,
    })
    if (snapshotChunk.type !== EventType.MESSAGES_SNAPSHOT) throw new Error('expected a messages snapshot chunk')

    const survivingCall = toolCallPartsOf(snapshotChunk.messages).find((part) => part.id === toolCallId)
    expect(survivingCall).toBeDefined()
    expect(survivingCall).toMatchObject({name: 'page.fill'})

    const capturesAfterReload = await kit.rpc.captures.list({sessionId})
    expect(capturesAfterReload.captures.some((row) => row.toolCallId === toolCallId)).toBe(true)
  }, 60_000)
})
