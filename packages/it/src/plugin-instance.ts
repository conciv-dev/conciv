import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createConcivUnplugin} from '@conciv/plugin'

const embedEntry = fileURLToPath(import.meta.resolve('@conciv/embed'))

export const unplugin: ReturnType<typeof createConcivUnplugin> = createConcivUnplugin({
  embedEntry,
  nativePageDir: dirname(embedEntry),
  dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
})
