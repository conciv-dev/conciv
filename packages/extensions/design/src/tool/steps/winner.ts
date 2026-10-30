import {winnerDef, WinnerResultSchema, type WinnerInput, type WinnerResult} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const winnerStep: ServerStep<WinnerInput, WinnerResult> = async (input, _ctx, _request, page) =>
  WinnerResultSchema.parse(await page.call(winnerDef.name, input))
