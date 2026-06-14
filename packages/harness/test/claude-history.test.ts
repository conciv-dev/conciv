import {describe, it, expect} from 'vitest'
import {parseHistory} from '../src/claude/history.js'

// claude records a user turn (from `-p "text"`) with message.content as a plain STRING, while
// assistant turns use a content-block array. History must keep both — on refresh the widget
// hydrates from this, and dropping string-content user messages makes only the AI's side show.
describe('parseHistory', () => {
  it('keeps user messages whose content is a plain string', () => {
    const jsonl = [
      JSON.stringify({type: 'user', message: {role: 'user', content: 'what else can you do?'}}),
      JSON.stringify({
        type: 'assistant',
        message: {role: 'assistant', content: [{type: 'text', text: 'Lots of things.'}]},
      }),
    ].join('\n')

    const msgs = parseHistory(jsonl)
    const roles = msgs.map((m) => m.role)
    expect(roles).toContain('user')
    expect(roles).toContain('assistant')

    const user = msgs.find((m) => m.role === 'user')
    expect(user?.parts).toContainEqual({type: 'text', content: 'what else can you do?'})
  })
})
