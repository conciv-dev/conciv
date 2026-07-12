import {fileURLToPath} from 'node:url'
import {createConcivUnplugin} from '@conciv/plugin'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'

export const unplugin = createConcivUnplugin({
  serverExtensions: [terminal, testRunner, whiteboard],
  clientEntries: [
    fileURLToPath(import.meta.resolve('@conciv/extension-terminal/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-test-runner/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-whiteboard/client')),
  ],
  embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
})
