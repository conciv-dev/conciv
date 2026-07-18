import {describe, expect, it} from 'vitest'
import {createNodeIndex} from '../src/server/node-index.js'
import {buttonFixture, pageFixture} from './fixtures/page.js'

const page = pageFixture([buttonFixture(4, 5, 'Save')])

describe('node index', () => {
  it('describes a node by its own text', () => {
    const index = createNodeIndex()
    index.applyFullSnapshot(page)
    expect(index.describe(4)).toContain('Save')
  })

  it('applies text mutations so later descriptions use the current label', () => {
    const index = createNodeIndex()
    index.applyFullSnapshot(page)
    index.applyMutation({adds: [], removes: [], attributes: [], texts: [{id: 5, value: 'Saving…'}]})
    expect(index.describe(4)).toContain('Saving…')
    expect(index.describe(4)).not.toContain('Save"')
  })

  it('removing a node drops its descendants and detaches it from its parent', () => {
    const index = createNodeIndex()
    index.applyFullSnapshot(page)
    index.applyMutation({adds: [], removes: [{id: 4}], attributes: [], texts: []})
    expect(index.describe(5)).toBe('node 5')
    expect(index.describe(1)).not.toContain('Save')
  })
})
