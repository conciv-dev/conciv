import type {DesignRuntime, Runner} from '../shared/defs.js'

export function createRunner(runtime: DesignRuntime): Runner {
  return async ({page}) => {
    const measured = await runtime.measurer.measure({page})
    return {unsettled: true, rendered: measured.live.children.length}
  }
}
