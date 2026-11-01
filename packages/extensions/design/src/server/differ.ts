import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {DesignPage, DesignRuntime, Differ, TargetStore} from '../shared/types.js'
import {runDiff} from '../tool/steps/diff.js'
import {targetStatus} from '../tool/steps/status.js'
import {registerTarget} from '../tool/steps/target.js'

export function createDiffer(input: {runtime: DesignRuntime; store: TargetStore; page: DesignPage}): Differ {
  const {store, page} = input
  const design = {...input.runtime, store}
  const tab = (session: SessionId): ServerToolPageAccess => ({
    call: (name, query) => page.ask({sessionId: session, name, input: query}),
  })
  return {
    register: ({input: target, session}) => registerTarget({input: target, session, design, page: tab(session)}),
    run: ({input: diff, session}) => runDiff({input: diff, session, design, page: tab(session)}),
    status: ({session}) => targetStatus({store, session}),
  }
}
