import {expect, test} from 'vitest'
import {validateSvg} from '../src/tool/canvas/svg-caps.js'

const wrap = (inner: string): string => `<svg viewBox='0 0 100 100'>${inner}</svg>`

test('accepts a modest svg', () => {
  expect(() => validateSvg(wrap("<rect x='1' y='1' width='10' height='10'/>"))).not.toThrow()
})

test('rejects payloads over 64kb', () => {
  const fat = wrap(`<path d='${'M 0 0 L 1 1 '.repeat(8000)}'/>`)
  expect(() => validateSvg(fat)).toThrow(/64kb/i)
})

test('rejects more than 400 drawable nodes', () => {
  const nodes = "<circle cx='1' cy='1' r='1'/>".repeat(401)
  expect(() => validateSvg(wrap(nodes))).toThrow(/400/)
})

test('rejects markup without an svg root', () => {
  expect(() => validateSvg('<div>nope</div>')).toThrow(/<svg/i)
})

test('rejects script and foreignObject', () => {
  expect(() => validateSvg(wrap('<script>1</script>'))).toThrow(/script/i)
  expect(() => validateSvg(wrap('<foreignObject/>'))).toThrow(/foreignObject/i)
})
