import {command, description, name, toggle} from '@bomb.sh/router'
import {envelopeFlag} from './envelope.js'
import {handler} from './router/handler.js'
import {runRpc} from './request.js'

export const pageChangesCommand = command(
  name('changes'),
  description('list (or --clear) the live-edit journal'),
  toggle(name('clear'), description('reset the journal after listing')),
  envelopeFlag,
  handler((model) =>
    runRpc((rpc) => (model.clear === true ? rpc.page.clearChanges(undefined) : rpc.page.changes(undefined))),
  ),
)
