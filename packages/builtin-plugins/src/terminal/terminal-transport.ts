import {getEventMeta} from '@orpc/client'
import type {TerminalListener, TerminalTransport} from '@conciv/ui-kit-terminal'
import type {ServerRef} from '@conciv/plugin/experimental'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'

type PtyClient = ServerRef['client']['experimental']['persistentPty']

type PtyOutputItem = {type: 'output'; data: string} | {type: 'meta'; cursor: number} | TtyServerControl

const ONCE = {context: {retry: 0}}

export type HeldPty = {ptyId: string; cursor: number | undefined}

function reportFailure(cause: unknown): void {
  console.error('[terminal] a terminal call failed', cause)
}

function relayItem(item: PtyOutputItem, listener: TerminalListener): void {
  if (item.type === 'output') {
    listener.data(item.data)
    return
  }
  if (item.type === 'meta') {
    listener.open()
    return
  }
  listener.control(item)
}

function readCursor(item: PtyOutputItem, fallback: number | undefined): number | undefined {
  const cursor = Number(getEventMeta(item)?.id)
  return Number.isSafeInteger(cursor) ? cursor : fallback
}

async function relayOutput(
  terminal: PtyClient,
  pty: HeldPty,
  listener: TerminalListener,
  signal: AbortSignal,
): Promise<void> {
  try {
    const input = pty.cursor === undefined ? {ptyId: pty.ptyId} : {ptyId: pty.ptyId, cursor: pty.cursor}
    for await (const item of await terminal.output(input, {signal, ...ONCE})) {
      relayItem(item, listener)
      pty.cursor = readCursor(item, pty.cursor)
    }
  } catch (cause) {
    if (!signal.aborted) console.error('[terminal] the terminal output stream ended', cause)
  }
  listener.closed()
}

export function rpcTerminalTransport(terminal: PtyClient, pty: HeldPty): TerminalTransport {
  return (_xterm, listener) => {
    const stop = new AbortController()
    void relayOutput(terminal, pty, listener, stop.signal)
    const sent = (call: Promise<unknown>): void => {
      call.catch(reportFailure)
    }
    return {
      write: (data) => sent(terminal.write({ptyId: pty.ptyId, data}, ONCE)),
      resize: (size) => sent(terminal.resize({ptyId: pty.ptyId, cols: size.cols, rows: size.rows})),
      inject: (text) => sent(terminal.inject({ptyId: pty.ptyId, text}, ONCE)),
      close: () => stop.abort(),
    }
  }
}
