import {defineTool} from '@mandarax/extension'
import {loadResolver} from '../../anchor/load-resolver.js'
import type {WhiteboardToolContext} from '../../server/context.js'
import {elementReferenceDef, type ElementReferenceInput} from './def.js'

export const elementReferenceTool = defineTool<typeof ElementReferenceInput, WhiteboardToolContext>(
  elementReferenceDef,
).server(async (input, ctx) => {
  const resolver = await loadResolver(ctx.cwd)
  const target = await resolver.locate(input.file, input.component)
  return target ? {found: true, ...target} : {found: false}
})

export const elementTools = [elementReferenceTool]
