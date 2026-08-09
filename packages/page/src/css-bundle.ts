import {stringifyStylesheet} from 'rrweb-snapshot'
import type {CssBundle} from '@conciv/protocol/element-capture-types'

const CSS_BUNDLE_CAP = 512 * 1024

const HASH_HEX_LENGTH = 16

export type PendingCssText = {css: string}

function collectCssText(doc: Document): string {
  const sheets: string[] = []
  for (const sheet of Array.from(doc.styleSheets)) {
    const text = stringifyStylesheet(sheet)
    if (text === null || text === '') continue
    sheets.push(text)
  }
  return sheets.join('\n')
}

export function collectPendingCss(doc: Document): PendingCssText | null {
  const css = collectCssText(doc)
  if (css === '' || css.length > CSS_BUNDLE_CAP) return null
  return {css}
}

export async function hashCssText(css: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(css))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `css${hex.slice(0, HASH_HEX_LENGTH)}`
}

export type ShippedCssBundle = {hash: string; bundle?: CssBundle}

export type CssBundleDeduper = (pending: PendingCssText) => Promise<ShippedCssBundle>

export function makeCssBundleDeduper(): CssBundleDeduper {
  const shipped = new Set<string>()
  return async (pending) => {
    const hash = await hashCssText(pending.css)
    if (shipped.has(hash)) return {hash}
    shipped.add(hash)
    return {hash, bundle: {hash, css: pending.css}}
  }
}
