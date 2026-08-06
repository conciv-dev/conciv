import {
  isPageFailure,
  PageErrorSchema,
  type PageError,
  type PageOutcome,
  type PageQuery,
} from '@conciv/protocol/page-types'
import type {ClientEffect, ClientToolEntry} from '@conciv/extension'
import {startConsoleBuffer} from './console-buffer.js'
import type {Refs} from './page-snapshot.js'
import {makePageToolDispatcher} from './page-tool-dispatcher.js'

export type PageDriver = {execute: (query: PageQuery) => Promise<PageOutcome>; refs: Refs; dispose: () => void}

function pageErrorOf(error: unknown): PageError {
  if (!isPageFailure(error)) {
    return {code: 'handler-error', message: error instanceof Error ? error.message : String(error)}
  }
  const reported = PageErrorSchema.safeParse(error.error)
  if (reported.success) return reported.data
  return {code: 'handler-error', message: error.error.message}
}

export function makeDomPageDriver(
  deps: {tools?: readonly ClientToolEntry[]; effects?: readonly ClientEffect[]; refs?: Refs} = {},
): PageDriver {
  const refs: Refs = deps.refs ?? {map: new Map(), n: 0}
  const effects = deps.effects ?? []
  const {buf: consoleBuf, dispose: disposeConsoleBuffer} = startConsoleBuffer()
  const dispatch = makePageToolDispatcher(deps.tools ?? [], refs, consoleBuf, effects)

  async function execute(query: PageQuery): Promise<PageOutcome> {
    try {
      return {ok: true, result: await dispatch(query)}
    } catch (error) {
      return {ok: false, error: pageErrorOf(error)}
    }
  }

  function dispose(): void {
    for (const effect of effects) if (effect.enabled()) effect.set(false)
    disposeConsoleBuffer()
  }

  return {execute, refs, dispose}
}
