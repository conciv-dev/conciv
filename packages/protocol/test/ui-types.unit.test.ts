import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {aguiCustomFor, parseUiSpec, DEVGENT_UI_EVENT, type UiSpec} from '../src/ui-types.js'

describe('aguiCustomFor', () => {
  it('wraps a spec as a CUSTOM StreamChunk named devgent-ui', () => {
    const spec: UiSpec = {kind: 'confirm', renderId: 'r1', question: 'OK?'}
    expect(aguiCustomFor(spec)).toEqual({type: EventType.CUSTOM, name: DEVGENT_UI_EVENT, value: spec})
  })
})

describe('parseUiSpec', () => {
  it('accepts a valid choices spec', () => {
    const spec = {kind: 'choices', renderId: 'r1', question: 'Q', options: ['a', 'b']}
    expect(parseUiSpec(spec)).toEqual(spec)
  })

  it('accepts a valid form spec with select options', () => {
    const spec = {
      kind: 'form',
      renderId: 'r1',
      fields: [{name: 'c', label: 'Color', type: 'select', options: ['x']}],
    }
    expect(parseUiSpec(spec)).toEqual(spec)
  })

  it('rejects a spec with no renderId', () => {
    expect(parseUiSpec({kind: 'confirm', question: 'Q'})).toBeNull()
  })

  it('rejects choices with empty options', () => {
    expect(parseUiSpec({kind: 'choices', renderId: 'r1', question: 'Q', options: []})).toBeNull()
  })

  it('rejects a non-object', () => {
    expect(parseUiSpec('nope')).toBeNull()
    expect(parseUiSpec(null)).toBeNull()
  })

  it('rejects an unknown kind', () => {
    expect(parseUiSpec({kind: 'mystery', renderId: 'r1'})).toBeNull()
  })

  it('parses a vitest spec', () => {
    expect(parseUiSpec({kind: 'vitest', renderId: 'x'})).toEqual({kind: 'vitest', renderId: 'x'})
  })
})
