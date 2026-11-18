import {Schema} from 'effect'
import {ephemeral, inventory} from './event.js'

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

const DiagnosticEvent = ephemeral({type: 'bundler.diagnostic', schema: {diagnostic: Diagnostic}})
export const Event = {Diagnostic: DiagnosticEvent, Definitions: inventory(DiagnosticEvent)}
