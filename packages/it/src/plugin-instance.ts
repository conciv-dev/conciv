import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createConcivUnplugin} from '@conciv/plugin'
import {builtinServerExtensions} from '@conciv/extension-compiler/builtin-server-extensions'

const embedEntry = fileURLToPath(import.meta.resolve('@conciv/embed'))

export const unplugin = createConcivUnplugin({
  serverExtensions: builtinServerExtensions,
  clientEntries: [
    fileURLToPath(import.meta.resolve('@conciv/extension-terminal/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-test-runner/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-whiteboard/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-recorder/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-ios/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-design/client')),
  ],
  embedEntry,
  nativePageDir: dirname(embedEntry),
  dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
})
