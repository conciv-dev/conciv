import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {iconNames} from '../../ui-kit-chat/src/icons/catalog.ts'

const names = iconNames().toSorted()

await writeFile(
  fileURLToPath(new URL('../src/experimental/icon-name.ts', import.meta.url)),
  ['export type AppIconName =', ...names.map((name) => `  | ${JSON.stringify(name)}`), ''].join('\n'),
)
