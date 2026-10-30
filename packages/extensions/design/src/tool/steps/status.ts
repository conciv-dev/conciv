import type {StatusInput, StatusReport} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'
import {liveRoute} from './target.js'

export const statusStep: ServerStep<StatusInput, StatusReport> = async (input, ctx, _request, page) => {
  const route = input.route ?? (await liveRoute(page))
  const records = await ctx.design.store.list({route})
  return {
    route,
    targets: records.map((record) => ({id: record.id, width: record.width, mismatch: null, above: 0, lastAt: null})),
    done: false,
  }
}
