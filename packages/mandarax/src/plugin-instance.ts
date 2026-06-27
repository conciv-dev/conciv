import {fileURLToPath} from 'node:url'
import {createMandaraxUnplugin} from '@mandarax/plugin'
import testRunner from '@mandarax/extension-test-runner'
import whiteboard from '@mandarax/extension-whiteboard'

// The shipped mandarax: the generic @mandarax/plugin bound to the built-in extensions. Server halves
// the engine mounts; client entries resolved to absolute paths (qu declares the built-ins, so the host
// app's node_modules need not) for the widget bundle to import.
export const unplugin = createMandaraxUnplugin({
  serverExtensions: [testRunner, whiteboard],
  clientEntries: [
    fileURLToPath(import.meta.resolve('@mandarax/extension-test-runner/client')),
    fileURLToPath(import.meta.resolve('@mandarax/extension-whiteboard/client')),
  ],
})
