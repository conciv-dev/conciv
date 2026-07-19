import {describe, expect, it} from 'vitest'
import {partContent} from '../src/chat-connection.js'

const doc = {
  type: 'document',
  source: {type: 'data', mimeType: 'application/x-test', value: 'eyJhIjoxfQ=='},
}

describe('partContent', () => {
  it('forwards a document part', () => {
    expect(partContent(doc)).toEqual([doc])
  })

  it('carries metadata through on text parts', () => {
    expect(partContent({type: 'text', content: 'x', metadata: {modelOnly: true}})).toEqual([
      {type: 'text', content: 'x', metadata: {modelOnly: true}},
    ])
  })

  it('still forwards image parts and drops unknown part types', () => {
    const image = {type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'aGVsbG8='}}
    expect(partContent(image)).toEqual([image])
    expect(partContent({type: 'thinking', content: 'x'})).toEqual([])
  })
})
