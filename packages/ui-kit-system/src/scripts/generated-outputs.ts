import {fileURLToPath} from 'node:url'
import {renderPluginContractDoc, renderSkinContractDoc} from './contract-docs.ts'
import {anchorEntries, declarationBlock, renderSkinCss} from '../skin-contract.ts'
import {DERIVED_TOKENS} from '../derived-tokens.ts'
import {BASE_SKIN, OVERLAY_SKINS} from './generated-skins.ts'

const SCHEME_RULES = ['.light {\n  color-scheme: light;\n}', '.dark {\n  color-scheme: dark;\n}'].join('\n\n')

function renderBaseTokensCss(): string {
  const anchors = anchorEntries(BASE_SKIN).map(([name, value]): [string, string] => [name, value])
  const derived = Object.entries(DERIVED_TOKENS).map(([name, def]): [string, string] => [name, def.value])
  const root = `:host,\n:root {\n  color-scheme: light dark;\n${declarationBlock([...anchors, ...derived])}\n}`
  return `${root}\n\n${SCHEME_RULES}\n`
}

function renderTokensCss(): string {
  return [renderBaseTokensCss(), ...OVERLAY_SKINS.map(renderSkinCss)].join('\n')
}

export type GeneratedOutput = {path: string; label: string; content: string}

export function generatedOutputs(): GeneratedOutput[] {
  return [
    {
      path: fileURLToPath(new URL('../tokens.css', import.meta.url)),
      label: 'packages/ui-kit-system/src/tokens.css',
      content: renderTokensCss(),
    },
    {
      path: fileURLToPath(new URL('../../docs/skin-anchors.md', import.meta.url)),
      label: 'packages/ui-kit-system/docs/skin-anchors.md',
      content: renderSkinContractDoc(),
    },
    {
      path: fileURLToPath(new URL('../../docs/plugin-tokens.md', import.meta.url)),
      label: 'packages/ui-kit-system/docs/plugin-tokens.md',
      content: renderPluginContractDoc(),
    },
  ]
}
