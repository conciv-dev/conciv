import {defineExtension, type RegisterExtension} from '@conciv/extension'
import {designConfig} from './shared/config.js'
import {DESIGN_EXTENSION_NAME} from './shared/defs.js'
import {CLIENT_TOOLS} from './tool/client.js'

export const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: CLIENT_TOOLS,
}).client(() => ({value: {}}))

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof design> {}
}

export default design
