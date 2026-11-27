import type {BundlerConfig, ModuleNode} from '@conciv/types/bundler-types'
import {Schema} from 'effect'
import {ephemeral, inventory} from './event.js'
import {engineErrors} from '@conciv/errors'

export const SourceLocation = Schema.Struct({line: Schema.Finite, column: Schema.Finite}).annotate({
  identifier: 'Bundler.SourceLocation',
})

export const BuildError = Schema.Struct({
  kind: Schema.Literal('build-error'),
  message: Schema.String,
  file: Schema.NullOr(Schema.String),
  loc: Schema.NullOr(SourceLocation),
  timestamp: Schema.Finite,
}).annotate({identifier: 'Bundler.BuildError'})

export const HmrUpdate = Schema.Struct({
  kind: Schema.Literal('hmr-update'),
  file: Schema.String,
  timestamp: Schema.Finite,
}).annotate({identifier: 'Bundler.HmrUpdate'})

export const RequestTrace = Schema.Struct({
  kind: Schema.Literal('request-trace'),
  method: Schema.String,
  url: Schema.String,
  status: Schema.Finite,
  durationMs: Schema.Finite,
  timestamp: Schema.Finite,
}).annotate({identifier: 'Bundler.RequestTrace'})

export const Diagnostic = Schema.Union([BuildError, HmrUpdate, RequestTrace]).annotate({
  identifier: 'Bundler.Diagnostic',
})
export type Diagnostic = typeof Diagnostic.Type

export const Status = Schema.Literals(['connected', 'disconnected']).annotate({identifier: 'Bundler.Status'})
export type Status = typeof Status.Type

const DiagnosticEvent = ephemeral({type: 'bundler.diagnostic', schema: {diagnostic: Diagnostic}})
const StatusEvent = ephemeral({type: 'bundler.status', schema: {status: Status}})
export const Event = {
  Diagnostic: DiagnosticEvent,
  Status: StatusEvent,
  Definitions: inventory(DiagnosticEvent, StatusEvent),
}

export type BundlerBridge = {
  id: string
  config(): BundlerConfig
  resolve(spec: string, importer?: string): Promise<{id: string | null}>
  moduleGraph(file: string): ModuleNode[]
  transform(url: string): Promise<{code: string | null}>
  urls(): {local: string[]; network: string[]}
  restart(force?: boolean): Promise<void>
  subscribe?(listener: (diagnostic: Diagnostic) => void): () => void
}

export function defineBundlerBridge<T extends BundlerBridge>(bridge: T): T {
  if (!bridge.id) throw engineErrors.BUNDLER_ID_MISSING()
  return bridge
}
