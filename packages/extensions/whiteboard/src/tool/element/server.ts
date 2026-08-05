import {defineTool} from '@conciv/extension'
import {loadResolver} from '../../anchor/load-resolver.js'
import type {WhiteboardToolContext} from '../../server/context.js'
import {elementReferenceDef} from './def.js'

export const elementReferenceTool = defineTool(elementReferenceDef).server(
  async (input, ctx: WhiteboardToolContext) => {
    const resolver = await loadResolver(ctx.cwd)
    const target = await resolver.locate(input.file, input.component)
    return target ? {found: true, ...target} : {found: false}
  },
)

export const elementTools = [elementReferenceTool]
