import {command, description, name, toggle} from '@bomb.sh/router'
import {envelopeFlag} from './envelope.js'
import {handler} from './router/handler.js'
import {runRpc} from './request.js'
import {tabFlag} from './tab-flag.js'

export const pageChangesCommand = command(
  name('changes'),
  description('list (or --clear) the live-edit journal'),
  toggle(name('clear'), description('reset the journal after listing')),
  envelopeFlag,
  tabFlag,
  handler((model, target) =>
    runRpc(target, (rpc) => (model.clear === true ? rpc.page.clearChanges(undefined) : rpc.page.changes(undefined))),
  ),
)
