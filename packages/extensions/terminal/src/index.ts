import {fileURLToPath} from 'node:url'
import type {ExtensionPackage} from '@conciv/protocol/config-types'

export default function terminal(): ExtensionPackage {
  return {
    server: fileURLToPath(import.meta.resolve('@conciv/extension-terminal/server')),
    client: fileURLToPath(import.meta.resolve('@conciv/extension-terminal/client')),
    config: undefined,
  }
}
