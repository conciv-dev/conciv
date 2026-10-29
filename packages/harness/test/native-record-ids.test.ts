import {describe, expect, it} from 'vitest'
import {parseHistory} from '../src/claude/history.js'

const line = (record: unknown): string => JSON.stringify(record)

describe('claude transcript records anchor their message ids', () => {
  it('mints each message id from the native record uuid', () => {
    const jsonl = [
      line({
        type: 'user',
        uuid: '93715f99-92e9-44dc-a1c1-c4a540f4c42d',
        message: {role: 'user', content: [{type: 'text', text: 'say it again'}]},
      }),
      line({
        type: 'assistant',
        uuid: '06b2a323-34c7-4913-9f9d-9681020b974b',
        message: {id: 'msg_1', role: 'assistant', content: [{type: 'text', text: 'here you go'}]},
      }),
    ].join('\n')
    expect(parseHistory(jsonl).map((message) => message.id)).toEqual([
      '93715f99-92e9-44dc-a1c1-c4a540f4c42d',
      '06b2a323-34c7-4913-9f9d-9681020b974b',
    ])
  })

  it('keeps the uuid of the record that opened a streamed assistant turn', () => {
    const jsonl = [
      line({type: 'user', uuid: 'u-1', message: {role: 'user', content: [{type: 'text', text: 'hello'}]}}),
      line({
        type: 'assistant',
        uuid: 'a-first',
        message: {id: 'msg_shared', role: 'assistant', content: [{type: 'text', text: 'part one'}]},
      }),
      line({
        type: 'assistant',
        uuid: 'a-second',
        message: {id: 'msg_shared', role: 'assistant', content: [{type: 'text', text: 'part two'}]},
      }),
    ].join('\n')
    const messages = parseHistory(jsonl)
    expect(messages.map((message) => message.id)).toEqual(['u-1', 'a-first'])
    expect(messages[1]?.parts).toEqual([
      {type: 'text', content: 'part one'},
      {type: 'text', content: 'part two'},
    ])
  })

  it('falls back to positional ids when the records carry no uuid', () => {
    const jsonl = [
      line({type: 'user', message: {role: 'user', content: [{type: 'text', text: 'no uuid here'}]}}),
      line({type: 'assistant', message: {id: 'msg_1', role: 'assistant', content: [{type: 'text', text: 'ok'}]}}),
    ].join('\n')
    expect(parseHistory(jsonl).map((message) => message.id)).toEqual(['h1', 'h2'])
  })
})
