import {afterEach, describe, expect, it} from 'vitest'
import {EventType} from '@tanstack/ai'
import {createTestHarness, type Kit} from '@conciv/harness-testkit'
import {requireClaude} from '../../helpers/adapters.js'
import {bootKit} from '../../helpers/boot.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function callThroughCatalog(name: string, input: unknown): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    if (typeof call !== 'function') throw new Error('binding missing: ' + found.call)
    return await call(${JSON.stringify(input)})
  `
}

type AskedUiCall = {kit: Kit; sessionId: string; pending: Promise<unknown>; toolCallId: string}

async function askedUiCall(input: unknown): Promise<AskedUiCall> {
  const kit = await bootKit()
  cleanups.push(() => kit.cleanup())
  const sessionId = await kit.session()
  const stream = await kit.attach(sessionId)
  const pending = kit.callTool('conciv_ui', input, sessionId)
  const call = await stream.waitForToolCall('conciv_ui', {hangGuardMs: 15_000})
  return {kit, sessionId, pending, toolCallId: call.toolCallId}
}

describe('conciv_ui asked through /api/mcp', () => {
  it('registers the ask so a widget answer lands as the tool result', async () => {
    const {kit, sessionId, pending, toolCallId} = await askedUiCall({kind: 'confirm', question: 'Proceed?'})
    await kit.rpc.chat.uiReply({sessionId, toolCallId, value: 'yes'})
    expect(JSON.stringify(await pending)).toContain('"answered":true')
  }, 45_000)

  it('a "questions" ask (the AskUserQuestion replacement) carries a structured multi-select answer back', async () => {
    const {kit, sessionId, pending, toolCallId} = await askedUiCall({
      kind: 'questions',
      questions: [
        {
          question: 'Which effects need live tuning knobs?',
          header: 'Effects',
          multiSelect: true,
          options: [{label: 'Ferrofluid'}, {label: 'Shader glow'}],
        },
      ],
    })
    await kit.rpc.chat.uiReply({sessionId, toolCallId, value: {Effects: ['Ferrofluid', 'Shader glow']}})
    expect(await pending).toEqual({answered: true, value: {Effects: ['Ferrofluid', 'Shader glow']}})
  }, 45_000)

  it('an explicit dismissal resolves with the dismissal wording, distinct from an unanswered timeout', async () => {
    const {kit, sessionId, pending, toolCallId} = await askedUiCall({kind: 'confirm', question: 'Proceed?'})
    await kit.rpc.chat.uiReply({sessionId, toolCallId, dismissed: true})
    expect(await pending).toEqual({answered: false, note: 'user dismissed the question'})
  }, 45_000)

  it('stopping the turn cancels a pending question the same way gate.ts cancels a pending approval', async () => {
    const harness = createTestHarness(requireClaude())
    const kit: Kit = await bootKit({}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: callThroughCatalog('conciv_ui', {kind: 'confirm', question: 'Proceed?'}),
    })
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'ui-ask-abort-1', sessionId, text: 'go'})
    const call = await stream.waitForToolCall('conciv_ui', {hangGuardMs: 15_000})
    await kit.rpc.chat.stop({sessionId})
    const result = await stream.waitFor(
      (chunk) => chunk.type === EventType.TOOL_CALL_RESULT && chunk.toolCallId === call.toolCallId,
      {hangGuardMs: 15_000},
    )
    const content = result.type === EventType.TOOL_CALL_RESULT ? result.content : ''
    expect(content).toContain('"answered":false')
    expect(content).not.toContain('user dismissed the question')
  }, 45_000)
})
