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
  const {buf: consoleBuf, dispose} = startConsoleBuffer()
  const dispatch = makePageToolDispatcher(deps.tools ?? [], refs, consoleBuf, deps.effects ?? [])

  async function execute(query: PageQuery): Promise<PageOutcome> {
    try {
      return {ok: true, result: await dispatch(query)}
    } catch (error) {
      return {ok: false, error: pageErrorOf(error)}
    }
  }

  return {execute, refs, dispose}
}
