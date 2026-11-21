import {describe, expect} from 'vitest'
import {test} from '../test/rpc-test.js'
import {createUiChannel} from './approvals.js'

describe('ui questions', () => {
  test('a question nobody answers tells the agent it is not answered yet', async ({advanceTimers}) => {
    const unanswered = {
      answered: false,
      note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
    }
    const channel = createUiChannel()

    const neverShown = channel.ask('session-1')
    await advanceTimers(5_000)
    await expect(neverShown).resolves.toEqual(unanswered)

    channel.noteToolCall('session-1', 'call-1', 'mcp__conciv__conciv_ui')
    const leftOpen = channel.ask('session-1')
    await advanceTimers(120_000)
    await expect(leftOpen).resolves.toEqual(unanswered)
  })
})
