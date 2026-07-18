import {describe, expect, it} from 'vitest'
import {expandUserParts} from '../src/chat/run.js'

const doc = {type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'eyJpZCI6MX0='}} as const

describe('expandUserParts', () => {
  it('appends expanded parts as modelOnly after the document', async () => {
    const expanders = {'application/x-test': async () => [{type: 'text' as const, content: 'clicked save'}]}
    const expanded = await expandUserParts([{type: 'text', content: 'why?'}, doc], expanders)
    expect(expanded).toEqual([
      {type: 'text', content: 'why?'},
      doc,
      {type: 'text', content: 'clicked save', metadata: {modelOnly: true}},
    ])
  })

  it('passes through untouched when no expander matches', async () => {
    expect(await expandUserParts([doc], {})).toEqual([doc])
    expect(await expandUserParts('plain', {})).toBe('plain')
  })

  it('falls back to an error text part when the expander throws', async () => {
    const expanders = {
      'application/x-test': async () => {
        throw new Error('renderer died')
      },
    }
    expect(await expandUserParts([doc], expanders)).toEqual([
      doc,
      {type: 'text', content: '[attachment could not be processed]', metadata: {modelOnly: true}},
    ])
  })
})
