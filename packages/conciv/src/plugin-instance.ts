import {fileURLToPath} from 'node:url'
import {createConcivUnplugin} from '@conciv/plugin'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'

// The shipped conciv: the generic @conciv/plugin bound to the built-in extensions. Server halves
// the engine mounts; client entries resolved to absolute paths (qu declares the built-ins, so the host
// app's node_modules need not) for the widget bundle to import.
export const unplugin = createConcivUnplugin({
  serverExtensions: [testRunner, whiteboard],
  clientEntries: [
    fileURLToPath(import.meta.resolve('@conciv/extension-test-runner/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-whiteboard/client')),
  ],
})
