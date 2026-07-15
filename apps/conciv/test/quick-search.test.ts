import {describe, expect, it} from 'vitest'
import {QuickSearchSchema, quickPaneIds, quickSearchFor} from '../src/lib/quick-search.js'

describe('quick search params', () => {
  it('round-trips pane ids and focus through the schema', () => {
    const search = quickSearchFor(['conciv_a1', 'conciv_b2'], 1)
    const parsed = QuickSearchSchema.parse(search)
    expect(parsed).toEqual({panes: 'conciv_a1,conciv_b2', focus: 1})
    expect(quickPaneIds(parsed)).toEqual(['conciv_a1', 'conciv_b2'])
  })

  it('drops non-session ids from panes', () => {
    const parsed = QuickSearchSchema.parse({panes: 'conciv_ok,,nope,conciv_2', focus: 0})
    expect(quickPaneIds(parsed)).toEqual(['conciv_ok', 'conciv_2'])
  })

  it('falls back to empty panes and focus 0 on invalid values', () => {
    expect(QuickSearchSchema.parse({})).toEqual({panes: '', focus: 0})
    expect(QuickSearchSchema.parse({panes: 42, focus: 'x'})).toEqual({panes: '', focus: 0})
    expect(QuickSearchSchema.parse({panes: 'conciv_a', focus: -3})).toEqual({panes: 'conciv_a', focus: 0})
  })

  it('empty pane list serializes to an empty panes string', () => {
    expect(quickSearchFor([], 0)).toEqual({panes: '', focus: 0})
    expect(quickPaneIds({panes: '', focus: 0})).toEqual([])
  })
})
