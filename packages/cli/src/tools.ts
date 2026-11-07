import {description, name, route} from '@bomb.sh/router'
import {DESIGN_TOOL_DEFS, DESIGN_TOOL_PREFIX} from '@conciv/extension-design/defs'
import {BUILTIN_TABS_TOOL} from '@conciv/tools/builtins'
import {envelopeFlag} from './envelope.js'
import {runRpc} from './request.js'
import {tabFlag} from './tab-flag.js'
import {toolCommand} from './tool-command.js'
import {serverRoute} from './server.js'
import {pageRoute, reactRoute} from './page.js'
import {openCommand} from './open.js'
import {toolGroupRoute} from './tool-group.js'

const designRoute = toolGroupRoute({
  prefix: DESIGN_TOOL_PREFIX,
  name: 'design',
  description: 'match the live page to a design image; run --help for every capability',
  builtIns: DESIGN_TOOL_DEFS,
})

const tabsCommand = toolCommand(BUILTIN_TABS_TOOL, {
  name: 'tabs',
  run: (input, target) => runRpc(target, (rpc) => rpc.registry.call({name: BUILTIN_TABS_TOOL.name, input})),
})

export const toolsRoute = route(
  name('tools'),
  description('inspect & drive the live dev server: page, react, design, server'),
  envelopeFlag,
  tabFlag,
  serverRoute,
  pageRoute,
  reactRoute,
  designRoute,
  openCommand,
  tabsCommand,
)
