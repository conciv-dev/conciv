import {describe, expect, it} from 'vitest'
import {defineAttachment} from '../src/define-attachment.js'

describe('defineAttachment', () => {
  it('records card and expand on the builder, matched by mime', () => {
    const Card = () => null
    const attachment = defineAttachment<{depth: number}>({mime: 'application/x-test'})
    attachment.card(Card)
    attachment.server((part, ctx) => [{type: 'text', content: `${part.source.mimeType}:${ctx.depth}`}])
    expect(attachment.mime).toBe('application/x-test')
    expect(attachment.__card).toBe(Card)
    expect(attachment.__expand).toBeTypeOf('function')
  })
})
