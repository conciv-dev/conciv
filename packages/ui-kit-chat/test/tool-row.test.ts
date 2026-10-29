import {describe, expect, it} from 'vitest'
import type {ToolCallPart} from '@tanstack/ai-client'
import {primaryArgument, shortToolLabel} from '../src/tools/primitives/tool-row.js'

function call(input: Record<string, unknown>): ToolCallPart {
  return {type: 'tool-call', id: 'c1', name: 'demo', arguments: JSON.stringify(input), state: 'complete'}
}

describe('shortToolLabel', () => {
  it('maps the execute/eval family of tool names to the exec verb', () => {
    expect(shortToolLabel('execute')).toBe('exec')
    expect(shortToolLabel('exec')).toBe('exec')
    expect(shortToolLabel('eval')).toBe('exec')
    expect(shortToolLabel('evaluate')).toBe('exec')
    expect(shortToolLabel('namespace__execute')).toBe('exec')
  })

  it('resolves the exec verb through a suffixed tool name instead of truncating mid-word', () => {
    expect(shortToolLabel('execute_js')).toBe('exec')
    expect(shortToolLabel('whiteboard__execute_js')).toBe('exec')
    expect(shortToolLabel('evaluate-script')).toBe('exec')
  })

  it('keeps the short known verbs as-is', () => {
    expect(shortToolLabel('Read')).toBe('read')
    expect(shortToolLabel('Write')).toBe('write')
    expect(shortToolLabel('Edit')).toBe('edit')
    expect(shortToolLabel('Bash')).toBe('bash')
    expect(shortToolLabel('tail')).toBe('tail')
  })

  it('maps a long verb to its short alias rather than clipping it mid-word', () => {
    expect(shortToolLabel('screenshot')).toBe('shot')
    expect(shortToolLabel('page__navigate')).toBe('nav')
  })

  it('keeps two same-suffix tools apart instead of collapsing both to the last word', () => {
    expect(shortToolLabel('page_dom_state')).toBe('dom_state')
    expect(shortToolLabel('tanstack_router_state')).toBe('router_state')
  })

  it('keeps a name that already fits whole', () => {
    expect(shortToolLabel('discovered_apis')).toBe('apis')
    expect(shortToolLabel('forecast')).toBe('forecast')
  })

  it('splits a camelCase name into words instead of clipping the run-together spelling', () => {
    expect(shortToolLabel('routerState')).toBe('router_state')
    expect(shortToolLabel('page__domSnapshot')).toBe('dom_snapshot')
    expect(shortToolLabel('tanstack.routeManifest')).toBe('manifest')
  })

  it('resolves a verb alias that only appears as a camelCase word', () => {
    expect(shortToolLabel('takeScreenshot')).toBe('shot')
    expect(shortToolLabel('readFile')).toBe('read')
  })

  it('splits an acronym-prefixed camelCase name on the word boundary', () => {
    expect(shortToolLabel('DOMSnapshot')).toBe('dom_snapshot')
  })

  it('drops the namespace segment from a snake_case first-party tool name', () => {
    expect(shortToolLabel('page_fill')).toBe('fill')
    expect(shortToolLabel('page_check')).toBe('check')
    expect(shortToolLabel('canvas_svg')).toBe('svg')
  })

  it('keeps a camelCase compound word intact even though tokenizing introduces underscores', () => {
    expect(shortToolLabel('DOMSnapshot')).toBe('dom_snapshot')
    expect(shortToolLabel('routerState')).toBe('router_state')
  })
})

describe('primaryArgument', () => {
  it('prefers a known target key over whichever string comes first', () => {
    expect(primaryArgument(call({dryRun: 'false', command: 'pnpm test'}))).toBe('pnpm test')
    expect(primaryArgument(call({mode: 'unified', file_path: 'src/app.tsx'}))).toBe('src/app.tsx')
  })

  it('collapses a multi-line argument into one line', () => {
    expect(primaryArgument(call({command: 'set -e\n\npnpm build\npnpm test'}))).toBe('set -e pnpm build pnpm test')
  })

  it('falls back to the first non-empty string when no known key is present', () => {
    expect(primaryArgument(call({note: 'ship it'}))).toBe('ship it')
  })

  it('returns nothing when the arguments carry no string at all', () => {
    expect(primaryArgument(call({count: 3, deep: {path: 'x'}}))).toBe('')
  })
})
