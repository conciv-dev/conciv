import {Effect, Fiber, Stream, type ManagedRuntime} from 'effect'
import {getEventMeta} from '@orpc/client'
import type {TerminalListener, TerminalTransport} from '@conciv/ui-kit-terminal'
import type {ServerRef} from '@conciv/plugin/experimental'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'

export type PtyClient = ServerRef['client']['experimental']['persistentPty']

type PtyOutputItem = {type: 'output'; data: string} | {type: 'meta'; cursor: number} | TtyServerControl

const ONCE = {context: {retry: 0}}

export type HeldPty = {ptyId: string; cursor: number | undefined}

function caught(cause: unknown) {
  return cause
}

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

function relayOutput(terminal: PtyClient, pty: HeldPty, listener: TerminalListener): Effect.Effect<void> {
  const items = Stream.unwrap(
    Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (controller) => Effect.sync(() => controller.abort()),
    ).pipe(
      Effect.flatMap((controller) => {
        const input = pty.cursor === undefined ? {ptyId: pty.ptyId} : {ptyId: pty.ptyId, cursor: pty.cursor}
        return Effect.tryPromise({
          try: () => terminal.output(input, {signal: controller.signal, ...ONCE}),
          catch: caught,
        })
      }),
      Effect.map((output) => Stream.fromAsyncIterable(output, caught)),
    ),
  )
  return items.pipe(
    Stream.runForEach((item) =>
      Effect.sync(() => {
        relayItem(item, listener)
        pty.cursor = readCursor(item, pty.cursor)
      }),
    ),
    Effect.catch((cause) => Effect.logWarning('[terminal] the terminal output stream ended', cause)),
    Effect.ensuring(Effect.sync(() => listener.closed())),
  )
}

export function rpcTerminalTransport(
  runtime: ManagedRuntime.ManagedRuntime<never, never>,
  terminal: PtyClient,
  pty: HeldPty,
): TerminalTransport {
  return (_xterm, listener) => {
    const relay = runtime.runFork(relayOutput(terminal, pty, listener))
    const sent = (call: Promise<unknown>): void => {
      call.catch(reportFailure)
    }
    return {
      write: (data) => sent(terminal.write({ptyId: pty.ptyId, data}, ONCE)),
      resize: (size) => sent(terminal.resize({ptyId: pty.ptyId, cols: size.cols, rows: size.rows})),
      close: () => void runtime.runFork(Fiber.interrupt(relay)),
    }
  }
}
