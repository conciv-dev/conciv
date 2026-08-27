import {anchorEntries, declarationBlock, renderSkinCss} from '../src/skin-contract.ts'
import {DERIVED_TOKENS} from '../src/derived-tokens.ts'
import {BASE_SKIN, OVERLAY_SKINS} from './generated-skins.ts'

const SCHEME_RULES = ['.light {\n  color-scheme: light;\n}', '.dark {\n  color-scheme: dark;\n}'].join('\n\n')

export function renderBaseTokensCss(): string {
  const anchors = anchorEntries(BASE_SKIN).map(([name, value]): [string, string] => [name, value])
  const derived = Object.entries(DERIVED_TOKENS).map(([name, def]): [string, string] => [name, def.value])
  const root = `:host,\n:root {\n  color-scheme: light dark;\n${declarationBlock([...anchors, ...derived])}\n}`
  return `${root}\n\n${SCHEME_RULES}\n`
}

export function renderTokensCss(): string {
  return [renderBaseTokensCss(), ...OVERLAY_SKINS.map(renderSkinCss)].join('\n')
}
