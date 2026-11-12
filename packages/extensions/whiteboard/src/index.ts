import {fileURLToPath} from 'node:url'
import type {ExtensionPackage} from '@conciv/protocol/config-types'

export default function whiteboard(): ExtensionPackage {
  return {
    server: fileURLToPath(import.meta.resolve('@conciv/extension-whiteboard/server')),
    client: fileURLToPath(import.meta.resolve('@conciv/extension-whiteboard/client')),
    config: undefined,
  }
}
