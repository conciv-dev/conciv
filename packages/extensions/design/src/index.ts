import {fileURLToPath} from 'node:url'
import type {z} from 'zod'
import type {ExtensionPackage} from '@conciv/protocol/config-types'
import {designConfig} from './shared/config.js'

export default function design(options: z.input<typeof designConfig> = {}): ExtensionPackage {
  return {
    server: fileURLToPath(import.meta.resolve('@conciv/extension-design/server')),
    client: fileURLToPath(import.meta.resolve('@conciv/extension-design/client')),
    config: designConfig.parse(options),
  }
}
