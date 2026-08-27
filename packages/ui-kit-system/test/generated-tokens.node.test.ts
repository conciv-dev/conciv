import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, test} from 'vitest'
import {SKIN_SCALAR_ANCHORS, SKIN_SCHEME_ANCHORS, skinClassName} from '../src/skin-contract.js'
import {DERIVED_TOKENS} from '../src/derived-tokens.js'
import {DEFAULT_SKIN_NAME, SKINS, type SkinName} from '../src/skins.js'

const sheet = readFileSync(fileURLToPath(new URL('../src/tokens.css', import.meta.url)), 'utf8')

const anchors = [...SKIN_SCHEME_ANCHORS, ...SKIN_SCALAR_ANCHORS]

const overlaySkins = Object.keys(SKINS).filter((name): name is SkinName => name in SKINS && name !== DEFAULT_SKIN_NAME)

function skinBlock(name: SkinName): string {
  const selector = `:host(.${skinClassName(name)}),\n.${skinClassName(name)} {`
  const start = sheet.indexOf(selector)
  if (start < 0) throw new Error(`no generated block for the ${name} skin`)
  return sheet.slice(start, sheet.indexOf('}', start))
}

describe('the committed token sheet', () => {
  test.each(anchors)('declares the %s anchor in the base block', (anchor) => {
    expect(sheet.slice(0, sheet.indexOf('.light {'))).toContain(`--${anchor}:`)
  })

  test.each(Object.keys(DERIVED_TOKENS))('declares the derived %s token in the base block', (token) => {
    expect(sheet.slice(0, sheet.indexOf('.light {'))).toContain(`--${token}:`)
  })

  test('scopes the base block to the shadow host and the document root', () => {
    expect(sheet.startsWith(':host,\n:root {')).toBe(true)
  })
})

describe.each(overlaySkins)('the generated %s skin block', (name) => {
  test('matches both the shadow-host and the light-DOM form of the skin class', () => {
    expect(sheet).toContain(`:host(.${skinClassName(name)}),\n.${skinClassName(name)} {`)
  })

  test('lands after the base block so it wins on equal specificity', () => {
    expect(sheet.indexOf(skinClassName(name))).toBeGreaterThan(sheet.indexOf('--chat-panel:'))
  })

  test.each(anchors)('overrides the %s anchor', (anchor) => {
    expect(skinBlock(name)).toContain(`--${anchor}:`)
  })

  test.each(Object.keys(DERIVED_TOKENS))('leaves the derived %s token to the base block', (token) => {
    expect(skinBlock(name)).not.toContain(`--${token}:`)
  })
})
