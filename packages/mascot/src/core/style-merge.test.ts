import {describe, expect, test} from 'vitest'
import {mergeStyle} from '../solid/mascot-props.js'
import {camelCaseProperty, kebabCaseProperty} from './style-merge.js'

describe('merging styles', () => {
  test.each([
    ['backgroundPositionX', 'background-position-x'],
    ['opacity', 'opacity'],
    ['--chat-accent', '--chat-accent'],
  ])('%s and %s name the same property', (camel, kebab) => {
    expect(kebabCaseProperty(camel)).toBe(kebab)
    expect(camelCaseProperty(kebab)).toBe(camel)
  })

  test.each([
    ['no style', undefined, false, {'--tip': '1'}],
    ['an object style', {opacity: '0.5'}, false, {'--tip': '1', opacity: '0.5'}],
    ['an object style on a layer', {top: '4px', opacity: '0.5'}, true, {'--tip': '1', opacity: '0.5'}],
    [
      'a style string with quotes and brackets',
      'color: red; --label: "a;b"; filter: drop-shadow(0 0 1px rgb(0 0 0 / 50%))',
      false,
      '--tip:1;color:red;--label:"a;b";filter:drop-shadow(0 0 1px rgb(0 0 0 / 50%))',
    ],
    [
      'a style string on a layer',
      'opacity: 0.5; top: 4px; background-image: url("a.png"); inset: 0; inset-inline-start: 2px; background-position-x: 3px; background-color: red; transform: none',
      true,
      '--tip:1;opacity:0.5;background-color:red;transform:none',
    ],
  ])('%s is merged over the mascot style', (_case, style, layer, merged) => {
    expect(mergeStyle({'--tip': '1'}, style, layer)).toEqual(merged)
  })
})
