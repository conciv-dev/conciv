import {join} from 'node:path'
import {defineExtension, toolError} from '@conciv/extension'
import {designConfig} from './shared/config.js'
import {DESIGN_EXTENSION_NAME} from './shared/defs.js'
import type {DesignRuntime} from './shared/types.js'
import {pickRuntime} from './server/registries.js'
import {createTargetStore} from './server/store.js'
import {SERVER_STEPS} from './tool/server.js'

function notImplemented(): never {
  throw toolError('not-implemented')
}

export const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
}).server((server) => {
  const runtime: DesignRuntime = {
    ...pickRuntime({config: server.config, server}),
    store: createTargetStore({dir: join(server.stateDir, 'design'), cwd: server.cwd}),
    cssMap: notImplemented,
  }
  return {context: {design: runtime}}
})

export default design
