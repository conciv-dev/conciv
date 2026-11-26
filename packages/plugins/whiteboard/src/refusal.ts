import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import type * as Permission from '@conciv/protocol/schema/permission'
import * as Tool from '@conciv/protocol/schema/tool'
import {Effect} from 'effect'
import type {SourceUnreadable} from './anchor-confine.js'
import type {StoreError} from './store.js'
import type {RenderFailed} from './preview.js'

type Failure = {code?: string; message: string; error?: unknown}
export type Confirm = Context['permission']

const CONFIRMED_TOOLS = [
  'whiteboard_canvas_delete',
  'whiteboard_canvas_clear',
  'whiteboard_comment_resolve',
  'whiteboard_comment_delete',
]

export const CONFIRMATION_RULES: Permission.Rule[] = CONFIRMED_TOOLS.map((action) => ({
  action,
  resource: '*',
  effect: 'ask',
}))

export function confirmed(
  permission: Confirm,
  action: string,
  metadata: Record<string, unknown>,
  tool: Pick<Tool.Context, 'sessionId' | 'agent' | 'messageId' | 'id'>,
) {
  return permission.assert({
    action,
    resources: ['*'],
    save: ['*'],
    metadata,
    sessionId: tool.sessionId,
    agent: tool.agent,
    source: {type: 'tool', messageId: tool.messageId, id: tool.id},
  })
}

export function fail({code, ...failure}: Failure) {
  return Effect.fail(Tool.toolError(code === undefined ? failure : {...failure, metadata: {code}}))
}

export function toolEdge<Value>(work: Effect.Effect<Value, Tool.Error | StoreError | RenderFailed | SourceUnreadable>) {
  return work.pipe(
    Effect.catchTags({
      StoreError: (failure) => fail({message: `whiteboard state ${failure.key} is unreadable: ${failure.message}`}),
      RenderFailed: (failure) => fail({message: failure.message}),
      SourceUnreadable: (failure) => fail({message: failure.message}),
    }),
  )
}
