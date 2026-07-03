import {describe, expect, it} from 'vitest'
import {createSlashCommandAdapter} from '../src/behaviors/create-slash-command-adapter.js'
import {createMentionAdapter} from '../src/behaviors/create-mention-adapter.js'

describe('createSlashCommandAdapter', () => {
  it('searches id, label, and description; executes by id; keeps items serializable', () => {
    const ran: string[] = []
    const {adapter, action} = createSlashCommandAdapter({
      commands: () => [
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
})

describe('createMentionAdapter', () => {
  it('serves flat items via search and categories via drill-in', () => {
    const {adapter, directive} = createMentionAdapter({
      categories: () => [
        {
          category: {id: 'tools', label: 'Tools'},
          items: [{id: 'page.read', type: 'tool', label: 'page.read'}],
        },
      ],
    })
    expect(adapter.categories().map((category) => category.id)).toEqual(['tools'])
    expect(adapter.categoryItems('tools').map((item) => item.id)).toEqual(['page.read'])
    expect(adapter.search?.('page').map((item) => item.id)).toEqual(['page.read'])
    expect(directive.formatter.serialize({id: 'page.read', type: 'tool', label: 'page.read'})).toBe(':tool[page.read]')
  })
})
