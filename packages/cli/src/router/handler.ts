import type {AnyRoute} from '@bomb.sh/router'
import type {CliOutcome} from '../envelope.js'

export type Handler = (model: Record<string, unknown>) => Promise<CliOutcome> | CliOutcome

export function handler(run: Handler) {
  return <R extends AnyRoute>(route: R): R & {run: Handler} => ({...route, run})
}

export function handlerOf(definition: AnyRoute): Handler | null {
  const run: unknown = Reflect.get(definition, 'run')
  return isHandler(run) ? run : null
}

function isHandler(value: unknown): value is Handler {
  return typeof value === 'function'
}
