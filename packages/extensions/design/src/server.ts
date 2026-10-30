import {defineExtension, toolError} from '@conciv/extension'
import {designConfig} from './shared/config.js'
import {DESIGN_EXTENSION_NAME} from './shared/defs.js'
import type {DesignRuntime, TargetStore} from './shared/types.js'
import {pickRuntime} from './server/registries.js'
import {SERVER_STEPS} from './tool/server.js'

function notImplemented(): never {
  throw toolError('not-implemented')
}

const PENDING_STORE: TargetStore = {
  put: notImplemented,
  find: notImplemented,
  list: notImplemented,
  remove: notImplemented,
  model: notImplemented,
  writeCapture: notImplemented,
  writeRun: notImplemented,
  lastResult: notImplemented,
  reportPath: notImplemented,
}

export const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
}).server((server) => {
  const runtime: DesignRuntime = {
    ...pickRuntime({config: server.config, server}),
    store: PENDING_STORE,
    cssMap: notImplemented,
  }
  return {context: {design: runtime}}
})

export default design
