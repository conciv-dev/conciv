import {fileURLToPath} from 'node:url'
import type {ExtensionPackage} from '@conciv/protocol/config-types'

export default function tanstack(): ExtensionPackage {
  return {
    server: fileURLToPath(import.meta.resolve('@conciv/extension-tanstack/server')),
    client: fileURLToPath(import.meta.resolve('@conciv/extension-tanstack/client')),
    config: undefined,
  }
}
