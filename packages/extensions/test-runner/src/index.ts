import {fileURLToPath} from 'node:url'
import type {z} from 'zod'
import type {ExtensionPackage} from '@conciv/protocol/config-types'
import {testRunnerConfig} from './shared/meta.js'

export default function testRunner(options: z.input<typeof testRunnerConfig> = {}): ExtensionPackage {
  return {
    server: fileURLToPath(import.meta.resolve('@conciv/extension-test-runner/server')),
    client: fileURLToPath(import.meta.resolve('@conciv/extension-test-runner/client')),
    config: testRunnerConfig.parse(options),
  }
}
