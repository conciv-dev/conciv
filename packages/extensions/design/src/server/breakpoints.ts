import type {DiffReport} from '../shared/defs.js'
import type {TargetRecord, TargetStore} from '../shared/types.js'

type RunResult = Omit<DiffReport, 'diffImage' | 'livePath'>

function deltaKeys(report: DiffReport): Set<string> {
  return new Set(
    report.components.flatMap((component) => component.deltas.map((delta) => `${delta.kind} ${component.selector}`)),
  )
}

export async function withBreakpoints(input: {
  result: RunResult
  record: TargetRecord
  store: TargetStore
}): Promise<RunResult> {
  const {result, record, store} = input
  const siblings = (await store.list({route: record.route})).filter((other) => other.width !== record.width)
  const others = (await Promise.all(siblings.map((other) => store.lastResult(other.id)))).filter(
    (report) => report !== null,
  )
  if (others.length === 0) return result
  const seen = others.map(deltaKeys)
  return {
    ...result,
    components: result.components.map((component) => ({
      ...component,
      deltas: component.deltas.map((delta) => {
        const key = `${delta.kind} ${component.selector}`
        return seen.some((keys) => keys.has(key)) ? delta : {...delta, breakpoint: true}
      }),
    })),
  }
}
