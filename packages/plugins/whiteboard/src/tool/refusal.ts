import type {Context} from '@conciv/plugin/effect/plugin'
import type {Permission} from '@conciv/plugin/schema/permission'
import {Tool} from '@conciv/plugin/schema/tool'
import {Effect} from 'effect'

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

export function fail({code, ...failure}: Failure): never {
  throw Tool.toolError(code === undefined ? failure : {...failure, metadata: {code}})
}

function toolFailure(error: unknown): Tool.Error {
  if (error instanceof globalThis.Error && Tool.isToolError(error)) return error
  return Tool.makeError({message: error instanceof globalThis.Error ? error.message : String(error), error})
}

export function attemptPromise<Value>(work: () => Promise<Value>) {
  return Effect.tryPromise({try: work, catch: toolFailure})
}
