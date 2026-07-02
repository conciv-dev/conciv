import {fileURLToPath} from 'node:url'
import {createConcivUnplugin} from '@conciv/plugin'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'

export const unplugin = createConcivUnplugin({
  serverExtensions: [testRunner, whiteboard],
  clientEntries: [
    fileURLToPath(import.meta.resolve('@conciv/extension-test-runner/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-whiteboard/client')),
  ],
})
