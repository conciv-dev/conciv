import {toolError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {captureDef, ViewportResultSchema, type TargetInput, type TargetResult} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export async function targetWidth(input: {width: number | undefined; page: ServerToolPageAccess}): Promise<number> {
  if (input.width !== undefined) return input.width
  return ViewportResultSchema.parse(await input.page.call(captureDef.name, {probe: true})).width
}

export const targetStep: ServerStep<TargetInput, TargetResult> = async (input, _ctx, _request, page) => {
  await targetWidth({width: input.width, page})
  throw toolError('not-implemented')
}
