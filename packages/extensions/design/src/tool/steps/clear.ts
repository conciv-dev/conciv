import type {ClearInput, ClearResult} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const clearStep: ServerStep<ClearInput, ClearResult> = async (input, ctx, request, page) => {
  const {store} = ctx.design
  const id = input.target ?? (await store.current({session: request.sessionId}))?.id
  const removed = await store.remove(input.all === true ? {all: true} : {id})
  await ctx.design.capture.clear({page})
  return {removed}
}
