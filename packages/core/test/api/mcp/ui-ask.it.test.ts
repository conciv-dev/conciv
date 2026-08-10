import {afterEach, describe, expect, it} from 'vitest'
import {bootKit} from '../../helpers/boot.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('conciv_ui asked through /api/mcp', () => {
  it('registers the ask so a widget answer lands as the tool result', async () => {
    const kit = await bootKit()
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    const pending = kit.callTool('conciv_ui', {kind: 'confirm', question: 'Proceed?'}, sessionId)
    const call = await stream.waitForToolCall('conciv_ui', {hangGuardMs: 15_000})
    await kit.rpc.chat.uiReply({sessionId, toolCallId: call.toolCallId, value: 'yes'})
    expect(JSON.stringify(await pending)).toContain('"answered":true')
  }, 45_000)
})
