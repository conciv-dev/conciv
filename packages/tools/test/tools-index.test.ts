import {describe, expect, it} from 'vitest'
import {allToolNames, createToolDefinition, createAllToolDefinitions} from '../src/tools.js'
import type {MandaraxToolContext} from '../src/types.js'

const ctx: MandaraxToolContext = {
  injectUi: () => true,
  page: async () => ({}),
  test: async () => ({}),
  open: () => {},
}

describe('tools index (pi mirror)', () => {
  it('createToolDefinition switches by name', () => {
    expect(createToolDefinition('page', ctx).name).toBe('mandarax_page')
    expect(createToolDefinition('effect', ctx).name).toBe('mandarax_page_effect')
  })

  it('createAllToolDefinitions covers exactly allToolNames', () => {
    expect(new Set(Object.keys(createAllToolDefinitions(ctx)))).toEqual(allToolNames)
  })

  it('every built-in definition carries an execute (none are render-only)', () => {
    for (const def of Object.values(createAllToolDefinitions(ctx))) expect(def.execute).toBeTypeOf('function')
  })
})
