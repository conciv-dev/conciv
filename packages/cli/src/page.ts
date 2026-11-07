import {command, description, name, toggle} from '@bomb.sh/router'
import {PAGE_TOOL_DEFS, PAGE_TOOL_PREFIX} from '@conciv/extension-page/defs'
import {envelopeFlag} from './envelope.js'
import {handler} from './router/handler.js'
import {runRpc} from './request.js'
import {tabFlag} from './tab-flag.js'
import {toolGroupRoute} from './tool-group.js'

const REACT_CATEGORY = 'react'

const changesCommand = command(
  name('changes'),
  description('list (or --clear) the live-edit journal'),
  toggle(name('clear'), description('reset the journal after listing')),
  envelopeFlag,
  tabFlag,
  handler((model, target) =>
    runRpc(target, (rpc) => (model.clear === true ? rpc.page.clearChanges(undefined) : rpc.page.changes(undefined))),
  ),
)

export const pageRoute = toolGroupRoute({
  prefix: PAGE_TOOL_PREFIX,
  name: 'page',
  description: 'read & drive the live page; run --help for every capability',
  builtIns: PAGE_TOOL_DEFS,
  extra: [changesCommand],
})

export const reactRoute = toolGroupRoute({
  prefix: PAGE_TOOL_PREFIX,
  name: 'react',
  description: 'inspect & edit live React components; run --help for every capability',
  builtIns: PAGE_TOOL_DEFS,
  filter: (signature) => signature.category === REACT_CATEGORY,
})
