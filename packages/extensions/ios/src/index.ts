import {fileURLToPath} from 'node:url'
import type {z} from 'zod'
import type {ExtensionPackage} from '@conciv/protocol/config-types'
import {IosConfigSchema} from './shared/meta.js'

export default function ios(options?: z.input<typeof IosConfigSchema>): ExtensionPackage {
  return {
    server: fileURLToPath(import.meta.resolve('@conciv/extension-ios/server')),
    client: fileURLToPath(import.meta.resolve('@conciv/extension-ios/client')),
    config: IosConfigSchema.parse(options),
  }
}
