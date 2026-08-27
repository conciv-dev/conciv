import {fileURLToPath} from 'node:url'
import {renderTokensCss} from './render-tokens.ts'
import {renderExtensionContractDoc, renderSkinContractDoc} from './contract-docs.ts'

export type GeneratedOutput = {path: string; label: string; content: string}

export function generatedOutputs(): GeneratedOutput[] {
  return [
    {
      path: fileURLToPath(new URL('../src/tokens.css', import.meta.url)),
      label: 'packages/ui-kit-system/src/tokens.css',
      content: renderTokensCss(),
    },
    {
      path: fileURLToPath(new URL('../docs/skin-anchors.md', import.meta.url)),
      label: 'packages/ui-kit-system/docs/skin-anchors.md',
      content: renderSkinContractDoc(),
    },
    {
      path: fileURLToPath(new URL('../docs/extension-tokens.md', import.meta.url)),
      label: 'packages/ui-kit-system/docs/extension-tokens.md',
      content: renderExtensionContractDoc(),
    },
  ]
}
