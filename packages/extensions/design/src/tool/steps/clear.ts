import type {ClearInput, ClearResult} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const clearStep: ServerStep<ClearInput, ClearResult> = async (input, ctx, _request, page) => {
  const removed = await ctx.design.store.remove({
    ...(input.target === undefined ? {} : {id: input.target}),
    ...(input.route === undefined ? {} : {route: input.route}),
  })
  await ctx.design.capture.clear({page})
  return {removed}
}
