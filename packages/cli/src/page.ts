import {command, description, name, toggle} from '@bomb.sh/router'
import {envelopeFlag} from './envelope.js'
import {handler} from './router/handler.js'
import {runRpc} from './request.js'
import {tabFlag} from './tab-flag.js'

const PAGE_RPC_ID = 'experimental.page'

export const pageChangesCommand = command(
  name('changes'),
  description('list (or --clear) the live-edit journal'),
  toggle(name('clear'), description('reset the journal after listing')),
  envelopeFlag,
  tabFlag,
  handler((model, target) =>
    runRpc(target, (rpc, sessionId) =>
      rpc.plugin.call({
        rpcId: PAGE_RPC_ID,
        method: model.clear === true ? 'clearChanges' : 'changes',
        input: {sessionId},
      }),
    ),
  ),
)
