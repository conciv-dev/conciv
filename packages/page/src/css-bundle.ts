import {stringifyStylesheet} from 'rrweb-snapshot'
import type {CssBundle} from '@conciv/protocol/element-capture-types'

const CSS_BUNDLE_CAP = 512 * 1024

function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `css${hash.toString(36)}${input.length.toString(36)}`
}

export type ShippedCssBundle = {hash: string; bundle?: CssBundle}

export type CssBundleShipper = (doc: Document) => ShippedCssBundle | null

function collectCssText(doc: Document): string {
  const sheets: string[] = []
  for (const sheet of Array.from(doc.styleSheets)) {
    const text = stringifyStylesheet(sheet)
    if (text === null || text === '') continue
    sheets.push(text)
  }
  return sheets.join('\n')
}

export function makeCssBundleShipper(): CssBundleShipper {
  const shipped = new Set<string>()
  return (doc) => {
    const css = collectCssText(doc)
    if (css === '' || css.length > CSS_BUNDLE_CAP) return null
    const hash = fnv1a(css)
    if (shipped.has(hash)) return {hash}
    shipped.add(hash)
    return {hash, bundle: {hash, css}}
  }
}
