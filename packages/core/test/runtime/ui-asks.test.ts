import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeUiAsks} from '../../src/runtime/ui-asks.js'

function startChunk(toolCallId: string, name = 'conciv_ui'): StreamChunk {
  return {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, toolName: name}
}

describe('makeUiAsks', () => {
  it('pairs ask-then-observe and resolves on reply', async () => {
    const asks = makeUiAsks()
    const pending = asks.ask('s1', 1000)
    asks.observe('s1', startChunk('tc-1'))
    expect(asks.reply('s1', 'tc-1', 'yes')).toBe(true)
    await expect(pending).resolves.toEqual({answered: true, value: 'yes'})
  })

  it('pairs observe-then-ask (bridge lane: the stream part lands before execute)', async () => {
    const asks = makeUiAsks()
    asks.observe('s1', startChunk('tc-1'))
    const pending = asks.ask('s1', 1000)
    expect(asks.reply('s1', 'tc-1', {path: '/docs'})).toBe(true)
    await expect(pending).resolves.toEqual({answered: true, value: {path: '/docs'}})
  })

  it('pairs FIFO: two asks, two calls, answers route by order', async () => {
    const asks = makeUiAsks()
    const first = asks.ask('s1', 1000)
    const second = asks.ask('s1', 1000)
    asks.observe('s1', startChunk('tc-1'))
    asks.observe('s1', startChunk('tc-2'))
    asks.reply('s1', 'tc-2', 'second')
    asks.reply('s1', 'tc-1', 'first')
    await expect(first).resolves.toEqual({answered: true, value: 'first'})
    await expect(second).resolves.toEqual({answered: true, value: 'second'})
  })

  it('sessions are isolated: another session answering the same toolCallId never settles this ask', async () => {
    const asks = makeUiAsks()
    const pending = asks.ask('s1', 1000)
    asks.observe('s2', startChunk('tc-1'))
    asks.reply('s2', 'tc-1', 'other')
    asks.observe('s1', startChunk('tc-1'))
    expect(asks.reply('s1', 'tc-1', 'mine')).toBe(true)
    await expect(pending).resolves.toEqual({answered: true, value: 'mine'})
  })

  it('ignores non-conciv_ui tool starts and non-start chunks', () => {
    const asks = makeUiAsks()
    asks.observe('s1', startChunk('tc-1', 'conciv_open'))
    asks.observe('s1', {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'x'})
    expect(asks.reply('s1', 'tc-1', 'yes')).toBe(false)
  })

  it('reply on an unknown or already-settled toolCallId returns false', async () => {
    const asks = makeUiAsks()
    expect(asks.reply('s1', 'tc-none', 'yes')).toBe(false)
    const pending = asks.ask('s1', 1000)
    asks.observe('s1', startChunk('tc-1'))
    expect(asks.reply('s1', 'tc-1', 'yes')).toBe(true)
    expect(asks.reply('s1', 'tc-1', 'again')).toBe(false)
    await pending
  })

  it('an answer landing between the stream part and execute registration still resolves (live-CLI ordering)', async () => {
    const asks = makeUiAsks()
    asks.observe('s1', startChunk('tc-1'))
    expect(asks.reply('s1', 'tc-1', 'yes')).toBe(true)
    expect(asks.reply('s1', 'tc-1', 'again')).toBe(false)
    await expect(asks.ask('s1', 1000)).resolves.toEqual({answered: true, value: 'yes'})
  })

  it('times out into the graceful unanswered result, never a rejection', async () => {
    const asks = makeUiAsks()
    const answer = await asks.ask('s1', 20)
    expect(answer.answered).toBe(false)
    if (!answer.answered) expect(answer.note).toContain('not answered')
  })

  it('endTurn settles every pending ask unanswered and clears the session', async () => {
    const asks = makeUiAsks()
    const unpaired = asks.ask('s1', 60_000)
    const paired = asks.ask('s1', 60_000)
    asks.observe('s1', startChunk('tc-1'))
    asks.endTurn('s1')
    await expect(unpaired).resolves.toMatchObject({answered: false})
    await expect(paired).resolves.toMatchObject({answered: false})
    expect(asks.reply('s1', 'tc-1', 'late')).toBe(false)
  })
})
