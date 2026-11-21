import {describe, expect, it, vi} from 'vitest'
import {createUiChannel} from './approvals.js'

describe('ui questions', () => {
  it('a question nobody answers tells the agent it is not answered yet', async () => {
    vi.useFakeTimers()
    const unanswered = {
      answered: false,
      note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
    }
    const channel = createUiChannel()

    const neverShown = channel.ask('session-1')
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(neverShown).resolves.toEqual(unanswered)

    channel.noteToolCall('session-1', 'call-1', 'mcp__conciv__conciv_ui')
    const leftOpen = channel.ask('session-1')
    await vi.advanceTimersByTimeAsync(120_000)
    await expect(leftOpen).resolves.toEqual(unanswered)
    vi.useRealTimers()
  })
})
