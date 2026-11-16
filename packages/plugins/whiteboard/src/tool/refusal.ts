import {Tool, type Plugin, type Rule, type ToolContext} from '@conciv/plugin'

type Failure = {code?: string; message: string; error?: unknown}
export type Confirm = Plugin.Context['permission']

const CONFIRMED_TOOLS = [
  'whiteboard_canvas_delete',
  'whiteboard_canvas_clear',
  'whiteboard_comment_resolve',
  'whiteboard_comment_delete',
]

export const CONFIRMATION_RULES: Rule[] = CONFIRMED_TOOLS.map((action) => ({action, resource: '*', effect: 'ask'}))

export function confirmed(
  permission: Confirm,
  action: string,
  metadata: Record<string, unknown>,
  tool: Pick<ToolContext, 'sessionId' | 'agent' | 'messageId' | 'id'>,
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
