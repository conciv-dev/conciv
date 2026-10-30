import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createConcivUnplugin} from '@conciv/plugin'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'
import recorder from '@conciv/extension-recorder'
import iosServer from '@conciv/extension-ios'
import design from '@conciv/extension-design'

const embedEntry = fileURLToPath(import.meta.resolve('@conciv/embed'))

export const unplugin = createConcivUnplugin({
  serverExtensions: [terminal, testRunner, whiteboard, recorder, iosServer, design],
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
