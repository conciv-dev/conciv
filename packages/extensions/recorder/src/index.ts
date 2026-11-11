import {fileURLToPath} from 'node:url'
import type {z} from 'zod'
import type {ExtensionPackage} from '@conciv/protocol/config-types'
import {recorderConfig} from './shared/protocol.js'

export default function recorder(options: z.input<typeof recorderConfig> = {}): ExtensionPackage {
  return {
    server: fileURLToPath(import.meta.resolve('@conciv/extension-recorder/server')),
    client: fileURLToPath(import.meta.resolve('@conciv/extension-recorder/client')),
    config: recorderConfig.parse(options),
  }
}
