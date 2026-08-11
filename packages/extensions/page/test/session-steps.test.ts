import {describe, expect, it} from 'vitest'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ElementDescriptor, ToolCaptureView} from '@conciv/protocol/element-capture-types'
import {PAGE_ACT_TOOL_NAMES} from '../src/shared/defs.js'
import {pageSessionScripted, pageSessionSteps} from '../src/client/cards/session-steps.js'

function actPart(
  id: string,
  name: string,
  input: Record<string, unknown>,
  state: ToolCallPart['state'] = 'complete',
): ToolCallPart {
  return {type: 'tool-call', id, name, arguments: JSON.stringify(input), input, state}
}

function streamingPart(id: string, name: string, argumentsText: string): ToolCallPart {
  return {type: 'tool-call', id, name, arguments: argumentsText, state: 'input-streaming'}
}

function okResult(id: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: id, content: JSON.stringify({ok: true}), state: 'complete'}
}

function errorResult(id: string, message: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: id, content: JSON.stringify({message}), state: 'error', error: message}
}

function descriptor(overrides: Partial<ElementDescriptor>): ElementDescriptor {
  return {tagName: 'input', selectorPath: '#field', ...overrides}
}

function captureOf(kind: 'before' | 'after', fields: Partial<ElementDescriptor>): ToolCaptureView {
  return {[kind]: {kind, ts: 1, descriptor: descriptor(fields)}}
}

function lookup<Value>(entries: Record<string, Value>): (id: string) => Value | undefined {
  return (id) => entries[id]
}

const NO_RESULTS = lookup<ToolResultPart>({})
const NO_CAPTURES = lookup<ToolCaptureView>({})

function steps(
  parts: ReadonlyArray<ToolCallPart>,
  resultFor: (id: string) => ToolResultPart | undefined = NO_RESULTS,
  captureFor: (id: string) => ToolCaptureView | undefined = NO_CAPTURES,
  streaming = true,
) {
  return pageSessionSteps(parts, resultFor, captureFor, PAGE_ACT_TOOL_NAMES, streaming)
}

describe('pageSessionSteps', () => {
  it('drops read calls and keeps act order', () => {
    const parts = [
      actPart('c1', 'page.fill', {selector: '#email', value: 'ada@example.com'}),
      actPart('c2', 'page.route', {}),
      actPart('c3', 'page.check', {selector: '#terms'}),
    ]
    const built = steps(parts, lookup({c1: okResult('c1'), c2: okResult('c2'), c3: okResult('c3')}))
    expect(built.map((step) => step.verb)).toEqual(['fill', 'check'])
  })

  it('prefers the after-capture accessible name over before-capture and input', () => {
    const parts = [actPart('c1', 'page.fill', {selector: '#email', value: 'ada@example.com'})]
    const capture: ToolCaptureView = {
      before: {kind: 'before', ts: 1, descriptor: descriptor({accessibleName: 'Old label'})},
      after: {kind: 'after', ts: 2, descriptor: descriptor({accessibleName: 'Email'})},
    }
    const built = steps(parts, lookup({c1: okResult('c1')}), lookup({c1: capture}))
    expect(built[0]?.target).toBe('Email')
  })

  it('falls back to the before-capture accessible name when after is missing', () => {
    const parts = [actPart('c1', 'page.click', {selector: '#save'})]
    const built = steps(
      parts,
      lookup({c1: okResult('c1')}),
      lookup({c1: captureOf('before', {accessibleName: 'Save'})}),
    )
    expect(built[0]?.target).toBe('Save')
  })

  it('falls back through input selector, ref and name when no capture names the element', () => {
    const bySelector = steps([actPart('c1', 'page.click', {selector: '#save'})])
    const byRef = steps([actPart('c1', 'page.click', {ref: 'e12'})])
    const byName = steps([actPart('c1', 'page.click', {name: 'SaveButton'})])
    expect(bySelector[0]?.target).toBe('#save')
    expect(byRef[0]?.target).toBe('e12')
    expect(byName[0]?.target).toBe('SaveButton')
  })

  it('ignores a capture whose accessible name is empty', () => {
    const built = steps(
      [actPart('c1', 'page.click', {selector: '#save'})],
      NO_RESULTS,
      lookup({c1: captureOf('after', {accessibleName: ''})}),
    )
    expect(built[0]?.target).toBe('#save')
  })

  it('gives targetless verbs their fixed labels', () => {
    const parts = [
      actPart('c1', 'page.css', {text: 'body{}'}),
      actPart('c2', 'page.eval', {code: '1'}),
      actPart('c3', 'page.effect', {action: 'list'}),
    ]
    const built = steps(parts)
    expect(built.map((step) => step.target)).toEqual(['stylesheet', 'script', 'effect'])
  })

  it('labels a targeted act with no target information as the page', () => {
    const built = steps([actPart('c1', 'page.scroll', {})])
    expect(built[0]?.target).toBe('page')
  })

  it('takes the value from the input first, then the capture descriptor', () => {
    const fromInput = steps(
      [actPart('c1', 'page.fill', {selector: '#email', value: 'ada@example.com'})],
      NO_RESULTS,
      lookup({c1: captureOf('after', {accessibleName: 'Email', value: 'stale'})}),
    )
    const fromDescriptor = steps(
      [actPart('c1', 'page.check', {selector: '#role'})],
      NO_RESULTS,
      lookup({c1: captureOf('after', {accessibleName: 'Role', value: 'Full Stack'})}),
    )
    const noValue = steps([actPart('c1', 'page.click', {selector: '#save'})])
    expect(fromInput[0]?.value).toBe('ada@example.com')
    expect(fromDescriptor[0]?.value).toBe('Full Stack')
    expect(noValue[0]?.value).toBeUndefined()
  })

  it('derives step state from the paired result', () => {
    const parts = [
      actPart('c1', 'page.fill', {selector: '#email', value: 'a'}),
      actPart('c2', 'page.click', {selector: '#save'}),
      actPart('c3', 'page.check', {selector: '#terms'}, 'input-streaming'),
    ]
    const built = steps(parts, lookup({c1: okResult('c1'), c2: errorResult('c2', 'element not found')}))
    expect(built.map((step) => step.state)).toEqual(['complete', 'error', 'streaming'])
  })

  it('flags targets that carry a human name so the card can quote them', () => {
    const fromCapture = steps(
      [actPart('c1', 'page.check', {selector: '#terms'})],
      NO_RESULTS,
      lookup({c1: captureOf('after', {accessibleName: 'Accept the terms of service'})}),
    )
    const fromComponentName = steps([actPart('c1', 'page.click', {name: 'SaveButton'})])
    const fromSelector = steps([actPart('c1', 'page.check', {selector: '#terms'})])
    const fixed = steps([actPart('c1', 'page.css', {text: 'body{}'})])
    expect(fromCapture[0]?.namedTarget).toBe(true)
    expect(fromComponentName[0]?.namedTarget).toBe(true)
    expect(fromSelector[0]?.namedTarget).toBe(false)
    expect(fixed[0]?.namedTarget).toBe(false)
  })

  it('marks a missing result as aborted once the session has settled', () => {
    const parts = [
      actPart('c1', 'page.fill', {selector: '#email', value: 'a'}),
      actPart('c2', 'page.check', {selector: '#terms'}),
    ]
    const results = lookup({c1: okResult('c1')})
    const settled = steps(parts, results, NO_CAPTURES, false)
    const live = steps(parts, results, NO_CAPTURES, true)
    expect(settled.map((step) => step.state)).toEqual(['complete', 'aborted'])
    expect(live.map((step) => step.state)).toEqual(['complete', 'streaming'])
  })

  it('reads structured input from the arguments string while streaming', () => {
    const built = steps([streamingPart('c1', 'page.fill', JSON.stringify({selector: '#email', value: 'ada'}))])
    expect(built[0]?.target).toBe('#email')
    expect(built[0]?.value).toBe('ada')
  })

  it('summarizes an eval step with the first meaningful code line, clipped', () => {
    const built = steps([actPart('c1', 'page.eval', {code: '\n\nconst title = document.title\nreturn title'})])
    expect(built[0]?.target).toBe('script')
    expect(built[0]?.value).toBe('const title = document.title')
  })

  it('clips a long eval line to the chip budget', () => {
    const line = `document.querySelector('${'x'.repeat(80)}')`
    const built = steps([actPart('c1', 'page.eval', {code: line})])
    expect(built[0]?.value?.length).toBe(64)
    expect(built[0]?.value?.endsWith('…')).toBe(true)
  })

  it('summarizes a css step with the first stylesheet rule line', () => {
    const built = steps([actPart('c1', 'page.css', {text: '\n.cta { color: red }\n.other { display: none }'})])
    expect(built[0]?.target).toBe('stylesheet')
    expect(built[0]?.value).toBe('.cta { color: red }')
  })
})

describe('pageSessionScripted', () => {
  it('is true only when every act is a script-ish verb', () => {
    const scriptOnly = steps([actPart('c1', 'page.eval', {code: '1'}), actPart('c2', 'page.css', {text: 'body{}'})])
    const mixed = steps([actPart('c1', 'page.eval', {code: '1'}), actPart('c2', 'page.fill', {selector: '#a'})])
    expect(pageSessionScripted(scriptOnly)).toBe(true)
    expect(pageSessionScripted(mixed)).toBe(false)
    expect(pageSessionScripted([])).toBe(false)
  })
})
