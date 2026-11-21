import {describe, expect, test} from 'vitest'
import {mergeStyle} from '../solid/mascot-props.js'
import {camelCaseProperty, isGeometryProperty, kebabCaseProperty} from './style-merge.js'

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
    ['top', true],
    ['background-image', true],
    ['inset', true],
    ['inset-inline-start', true],
    ['background-position-x', true],
    ['background-color', false],
    ['opacity', false],
    ['transform', false],
  ])('the property %s places a layer: %s', (property, geometry) => {
    expect(isGeometryProperty(property)).toBe(geometry)
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
      'opacity: 0.5; top: 4px; background-image: url("a.png")',
      true,
      '--tip:1;opacity:0.5',
    ],
  ])('%s is merged over the mascot style', (_case, style, layer, merged) => {
    expect(mergeStyle({'--tip': '1'}, style, layer)).toEqual(merged)
  })
})
