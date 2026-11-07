import {description, name, route} from '@bomb.sh/router'
import {DESIGN_TOOLS, DESIGN_TOOL_PREFIX} from '@conciv/extension-design/defs'
import {envelopeFlag} from './envelope.js'
import {serverRoute} from './server.js'
import {pageRoute, reactRoute} from './page.js'
import {openCommand} from './open.js'
import {toolGroupRoute} from './tool-group.js'

const designRoute = toolGroupRoute({
  prefix: DESIGN_TOOL_PREFIX,
  name: 'design',
  description: 'match the live page to a design image; run --help for every capability',
  builtIns: DESIGN_TOOLS.filter((def) => def.meta?.catalog !== false),
})

export const toolsRoute = route(
  name('tools'),
  description('inspect & drive the live dev server: page, react, design, server'),
  envelopeFlag,
  serverRoute,
  pageRoute,
  reactRoute,
  designRoute,
  openCommand,
)
