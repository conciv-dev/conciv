import type {AnyToolBuilder} from '@conciv/extension'
import {DESIGN_TOOLS, type DesignRuntime, type Differ} from '../shared/defs.js'

const [getDef, watchDef, validateDef] = DESIGN_TOOLS

export const SERVER_STEPS = [
  getDef.server((input, ctx: DesignContext, request, page) =>
    ctx.differ.get({input, session: request.sessionId, page}),
  ),
  watchDef.server((input, ctx: DesignContext, request) =>
    ctx.differ.watch({nodes: input.nodes, session: request.sessionId}),
  ),
  validateDef.server((_input, ctx: DesignContext, request) => ctx.differ.validate({session: request.sessionId})),
] as const satisfies readonly AnyToolBuilder[]

type DesignContext = {design: DesignRuntime; differ: Differ}
