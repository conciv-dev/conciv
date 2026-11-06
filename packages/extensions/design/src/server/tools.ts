import {omit, pick} from 'es-toolkit'
import type {z} from 'zod'
import type {AnyToolBuilder, ToolRequest} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {DESIGN_TOOLS, type DesignRuntime, type Differ, type DiffReport} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'

const [targetDef, diffDef, statusDef, watchDef, captureDef, , , winnerDef, clearDef] = DESIGN_TOOLS

export const SERVER_STEPS = [
  targetDef.server((input, ctx: DesignContext, request, page) =>
    ctx.differ.register({input, session: request.sessionId, page}),
  ),
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
    paired: report.ledger.paired,
    unbuilt: report.ledger.unbuilt,
    icons: report.unmatched.filter(
      (entry) =>
        entry.kind === 'unbuilt' &&
        entry.label === 'image' &&
        entry.target !== undefined &&
        designConfig.iconSized(entry.target),
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
  const measured = await ctx.design.measurer.measure({height: input.height, timeout: input.timeout, page})
  const key = await ctx.design.store.writeCapture(measured.raster.png())
  const path = ctx.design.store.path(key) ?? key
  return {
    path,
    width: measured.raster.width,
    height: measured.raster.height,
    route: measured.route,
    components: measured.live.children,
  }
}

async function clearStep(
  ...[input, ctx, request]: Parameters<ServerStep<ClearInput, ClearResult>>
): Promise<ClearResult> {
  const {store} = ctx.design
  const id = input.target ?? (await store.current(request.sessionId))?.id
  return {removed: await store.remove(input.all === true ? {all: true} : {id})}
}

async function winnerStep(...[input, , , page]: Parameters<ServerStep<WinnerInput, unknown>>): Promise<unknown> {
  const schema = winnerDef.outputSchema
  const reply: unknown = await page.call(winnerDef.name, input)
  return schema === undefined ? reply : schema.parse(reply)
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

const BLIND_FIELDS = ['livePath', 'diffImage', 'capturePath'] as const

type CompactReport = z.output<NonNullable<(typeof diffDef)['outputSchema']>>
type CaptureInput = z.output<(typeof captureDef)['inputSchema']>
type CaptureResult = z.output<NonNullable<(typeof captureDef)['outputSchema']>>
type ClearInput = z.output<(typeof clearDef)['inputSchema']>
type ClearResult = z.output<NonNullable<(typeof clearDef)['outputSchema']>>
type WinnerInput = z.output<(typeof winnerDef)['inputSchema']>

type ServerStep<Input, Output> = (
  input: Input,
  ctx: DesignContext,
  request: ToolRequest,
  page: ServerToolPageAccess,
) => Promise<Output>

type DesignContext = {design: DesignRuntime; differ: Differ}
