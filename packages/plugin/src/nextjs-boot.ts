import type {ConcivConfig} from '@conciv/protocol/config-types'
import {NO_BUILTINS} from '@conciv/extension-compiler/extensions'
import {makeEngineBooter} from './core/boot.js'

export async function bootConcivEngine(options: ConcivConfig, root: string): Promise<void> {
  await makeEngineBooter(options, root, NO_BUILTINS)()
}
