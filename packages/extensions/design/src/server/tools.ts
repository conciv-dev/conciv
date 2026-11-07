import type {AnyToolBuilder} from '@conciv/extension'
import {DESIGN_TOOLS, type DesignRuntime, type Differ} from '../shared/defs.js'

const [getDef, watchDef, validateDef] = DESIGN_TOOLS

export const SERVER_STEPS = [
  getDef.server((input, ctx: DesignContext, request, page) =>
    recorded({
      ctx,
      tool: getDef.name,
      input,
      session: request.sessionId,
      call: () => ctx.differ.get({input, session: request.sessionId, page}),
    }),
  ),
  watchDef.server((input, ctx: DesignContext, request) =>
    recorded({
      ctx,
      tool: watchDef.name,
      input,
      session: request.sessionId,
      call: () => ctx.differ.watch({nodes: input.nodes, session: request.sessionId}),
    }),
  ),
  validateDef.server((input, ctx: DesignContext, request) =>
    recorded({
      ctx,
      tool: validateDef.name,
      input,
      session: request.sessionId,
      call: () => ctx.differ.validate({session: request.sessionId}),
    }),
  ),
] as const satisfies readonly AnyToolBuilder[]

type DesignContext = {design: DesignRuntime; differ: Differ}

async function recorded<Reply>(input: {
  ctx: DesignContext
  tool: string
  input: unknown
  session: string
  call: () => Promise<Reply>
}): Promise<Reply> {
  const {ctx, tool, session} = input
  const started = Date.now()
  const write = (outcome: {replyBytes: number | null; error: string | null}) =>
    ctx.design.store.writeToolCall({session, tool, input: input.input, durationMs: Date.now() - started, ...outcome})
  try {
    const reply = await input.call()
    await write({replyBytes: Buffer.byteLength(JSON.stringify(reply)), error: null})
    return reply
  } catch (error) {
    await write({replyBytes: null, error: error instanceof Error ? error.message : String(error)})
    throw error
  }
}
