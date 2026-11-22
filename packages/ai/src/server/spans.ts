import {AsyncResource} from 'node:async_hooks'
import type {OtelMiddlewareOptions} from '@tanstack/ai/middlewares/otel'

export type Tracer = OtelMiddlewareOptions['tracer']

type Span = ReturnType<Tracer['startSpan']>

export type SpanAttributes = Record<string, string | number | boolean>

const SPAN_STATUS_ERROR = 2

function markFailed(span: Span, error: unknown): void {
  span.setAttribute('error.type', error instanceof Error ? error.name : typeof error)
  span.setStatus({code: SPAN_STATUS_ERROR})
}

export function inSpan<Value>(
  tracer: Tracer | undefined,
  name: string,
  attributes: SpanAttributes,
  work: () => Promise<Value>,
  placement: {root?: boolean} = {},
): Promise<Value> {
  if (tracer === undefined) return work()
  return tracer.startActiveSpan(name, {attributes, root: placement.root}, async (span) => {
    try {
      return await work()
    } catch (error) {
      markFailed(span, error)
      throw error
    } finally {
      span.end()
    }
  })
}

export function streamInSpan<Value>(
  tracer: Tracer | undefined,
  name: string,
  attributes: SpanAttributes,
  open: () => AsyncIterable<Value>,
): AsyncIterable<Value> {
  if (tracer === undefined) return open()
  return tracer.startActiveSpan(name, {attributes}, (span) => spanned(span, new AsyncResource(name), open))
}

async function* spanned<Value>(
  span: Span,
  scope: AsyncResource,
  open: () => AsyncIterable<Value>,
): AsyncGenerator<Value> {
  const iterator = scope.runInAsyncScope(() => open()[Symbol.asyncIterator]())
  const state = {done: false}
  try {
    while (!state.done) {
      const next = await scope.runInAsyncScope(() => iterator.next())
      if (next.done === true) state.done = true
      else yield next.value
    }
  } catch (error) {
    state.done = true
    markFailed(span, error)
    throw error
  } finally {
    if (!state.done) await scope.runInAsyncScope(async () => iterator.return?.())
    span.end()
  }
}
