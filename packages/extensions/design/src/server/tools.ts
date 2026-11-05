import {omit, pick} from 'es-toolkit'
import type {AnyToolBuilder} from '@conciv/extension'
import {
  BLIND_FIELDS,
  captureDef,
  clearDef,
  diffDef,
  statusDef,
  targetDef,
  watchDef,
  winnerDef,
  WinnerResultSchema,
  type CaptureInput,
  type CaptureResult,
  type ClearInput,
  type ClearResult,
  type CompactReport,
  type DiffReport,
  type WinnerInput,
  type WinnerResult,
} from '../shared/defs.js'
import {iconSized} from '../shared/tolerances.js'
import type {DesignContext, ServerStep} from '../shared/types.js'
import {encodePng} from './raster.js'

export const SERVER_STEPS = [
  targetDef.server((input, ctx: DesignContext, request) => ctx.differ.register({input, session: request.sessionId})),
  diffDef.server(async (input, ctx: DesignContext, request) => {
    const report = await ctx.differ.run({input, session: request.sessionId})
    const design =
      input.full === true ? ctx.design.words.outline(await ctx.design.store.design(report.target.id)) : null
    const compact = shaped({report, design, limit: input.limit})
    return ctx.design.blind ? omit(compact, BLIND_FIELDS) : compact
  }),
  statusDef.server((_input, ctx: DesignContext, request) => ctx.differ.status({session: request.sessionId})),
  watchDef.server((input, ctx: DesignContext, request) => ctx.differ.watch({input, session: request.sessionId})),
  captureDef.server(captureStep),
  winnerDef.server(winnerStep),
  clearDef.server(clearStep),
] as const satisfies readonly AnyToolBuilder[]

function shaped(input: {report: DiffReport; design: string[] | null; limit: number}): CompactReport {
  const {report} = input
  const counts = {
    components: report.components.length,
    paired: report.paired,
    unbuilt: report.unmatched.filter((entry) => entry.kind === 'unbuilt').length,
    icons: report.unmatched.filter(
      (entry) =>
        entry.kind === 'unbuilt' && entry.label === 'image' && entry.target !== undefined && iconSized(entry.target),
    ).length,
    unmatched: report.unmatched.length,
    warnings: report.warnings.length,
    done: report.ledger.done,
    regressed: report.ledger.regressed,
    drawn: report.warnings.filter((warning) => warning.warning === 'svg-drawn').length,
  }
  if (input.design !== null) {
    return {
      ...report,
      components: report.components.slice(0, input.limit),
      unmatched: report.unmatched.slice(0, input.limit),
      truncated: {
        components: Math.max(0, report.components.length - input.limit),
        unmatched: Math.max(0, report.unmatched.length - input.limit),
      },
      design: input.design,
      counts,
    }
  }
  return {...pick(report, COMPACT_FIELDS), counts}
}

async function captureStep(
  ...[input, ctx, , page]: Parameters<ServerStep<CaptureInput, CaptureResult>>
): Promise<CaptureResult> {
  const {capture: live} = await ctx.design.measurer.measure({height: input.height, timeout: input.timeout, page})
  const key = await ctx.design.store.writeCapture(encodePng(live.raster))
  const path = ctx.design.store.path(key) ?? key
  return {path, width: live.raster.width, height: live.raster.height, route: live.route, components: live.components}
}

async function clearStep(
  ...[input, ctx, request]: Parameters<ServerStep<ClearInput, ClearResult>>
): Promise<ClearResult> {
  const {store} = ctx.design
  const id = input.target ?? (await store.current(request.sessionId))?.id
  return {removed: await store.remove(input.all === true ? {all: true} : {id})}
}

async function winnerStep(
  ...[input, , , page]: Parameters<ServerStep<WinnerInput, WinnerResult>>
): Promise<WinnerResult> {
  return WinnerResultSchema.parse(await page.call(winnerDef.name, input))
}

const COMPACT_FIELDS = [
  'target',
  'round',
  'stage',
  'stop',
  'score',
  'mismatch',
  'similarity',
  'brief',
  'timings',
  'rows',
  'xray',
  'diffImage',
  'livePath',
  'capturePath',
  'sources',
  'partial',
  'hint',
  'painted',
  'changes',
  'designPath',
  'placeholderPath',
] as const satisfies readonly (keyof CompactReport & keyof DiffReport)[]
