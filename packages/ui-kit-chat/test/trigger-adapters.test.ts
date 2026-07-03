import {describe, expect, it} from 'vitest'
import {createSlashCommandAdapter} from '../src/behaviors/create-slash-command-adapter.js'
import {createMentionAdapter} from '../src/behaviors/create-mention-adapter.js'

describe('createSlashCommandAdapter', () => {
  it('searches id, label, and description; executes by id; keeps items serializable', () => {
    const ran: string[] = []
    const {adapter, action} = createSlashCommandAdapter({
      commands: [
        {id: 'summarize', description: 'Summarize the thread', execute: () => ran.push('summarize')},
        {id: 'translate', label: '/translate', execute: () => ran.push('translate')},
      ],
      removeOnExecute: true,
    })
    expect(adapter.categories()).toEqual([])
    const results = adapter.search?.('summ') ?? []
    expect(results.map((item) => item.id)).toEqual(['summarize'])
    expect(results[0]).not.toHaveProperty('execute')
    action.onExecute({id: 'translate', type: 'command', label: '/translate'})
    expect(ran).toEqual(['translate'])
    expect(action.removeOnExecute).toBe(true)
  })

  it('returns everything for an empty query', () => {
    const {adapter} = createSlashCommandAdapter({
      commands: [
        {id: 'one', execute: () => {}},
        {id: 'two', execute: () => {}},
      ],
    })
    expect(adapter.search?.('').map((item) => item.id)).toEqual(['one', 'two'])
  })
})

describe('createMentionAdapter', () => {
  it('serves categorized mentions with drill-in and cross-category search', () => {
    const {adapter, directive} = createMentionAdapter({
      categories: [{id: 'people', label: 'People', items: [{id: 'ada', type: 'user', label: 'Ada'}]}],
      includeModelContextTools: false,
    })
    expect(adapter.categories().map((category) => category.id)).toEqual(['people'])
    expect(adapter.categoryItems('people').map((item) => item.id)).toEqual(['ada'])
    expect(adapter.search?.('ad').map((item) => item.id)).toEqual(['ada'])
    expect(directive.formatter.serialize({id: 'ada', type: 'user', label: 'Ada'})).toBe(':user[Ada]{name=ada}')
  })

  it('appends model-context tools as a category when categorized', () => {
    const {adapter} = createMentionAdapter({
      categories: [{id: 'people', label: 'People', items: [{id: 'ada', type: 'user', label: 'Ada'}]}],
      modelContextTools: [{name: 'page.read', description: 'Read the page'}],
      includeModelContextTools: true,
    })
    expect(adapter.categories().map((category) => category.id)).toEqual(['people', 'tools'])
    expect(adapter.categoryItems('tools').map((item) => item.id)).toEqual(['page.read'])
  })

  it('defaults to a flat tool pool when no items or categories are given', () => {
    const {adapter} = createMentionAdapter({
      modelContextTools: [{name: 'page.read'}, {name: 'page.edit'}],
    })
    expect(adapter.categories()).toEqual([])
    expect(adapter.search?.('page').map((item) => item.id)).toEqual(['page.read', 'page.edit'])
  })

  it('dedupes flat items against tools, explicit items win', () => {
    const {adapter} = createMentionAdapter({
      items: [{id: 'page.read', type: 'custom', label: 'Page reader'}],
      modelContextTools: [{name: 'page.read'}, {name: 'page.edit'}],
      includeModelContextTools: true,
    })
    const results = adapter.search?.('page') ?? []
    expect(results.map((item) => `${item.id}:${item.type}`)).toEqual(['page.read:custom', 'page.edit:tool'])
  })

  it('merges the icon shortcut into metadata', () => {
    const {adapter} = createMentionAdapter({
      items: [{id: 'ada', type: 'user', label: 'Ada', icon: 'UserIcon', metadata: {team: 'core'}}],
      includeModelContextTools: false,
    })
    expect(adapter.search?.('ada')[0]?.metadata).toEqual({team: 'core', icon: 'UserIcon'})
  })
})
