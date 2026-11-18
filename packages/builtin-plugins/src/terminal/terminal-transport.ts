import type {TerminalListener, TerminalTransport} from '@conciv/ui-kit-terminal'
import type {ServerRef} from '@conciv/plugin/experimental'

type PtyClient = ServerRef['client']['experimental']['persistentPty']

export type HeldPty = {ptyId: string; cursor: number | undefined}

function reportFailure(cause: unknown): void {
  console.error('[terminal] a terminal call failed', cause)
}

async function relayOutput(
  terminal: PtyClient,
  pty: HeldPty,
  listener: TerminalListener,
  signal: AbortSignal,
): Promise<void> {
  const position = {following: false}
  try {
    const input = pty.cursor === undefined ? {ptyId: pty.ptyId} : {ptyId: pty.ptyId, cursor: pty.cursor}
    for await (const item of await terminal.output(input, {signal})) {
      if (item.type === 'output') {
        if (position.following) pty.cursor = (pty.cursor ?? 0) + item.data.length
        listener.data(item.data)
        continue
      }
      if (item.type === 'meta') {
        pty.cursor = item.cursor
        position.following = true
        listener.open()
        continue
      }
      listener.control(item)
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
      write: (data) => sent(terminal.write({ptyId: pty.ptyId, data})),
      resize: (size) => sent(terminal.resize({ptyId: pty.ptyId, cols: size.cols, rows: size.rows})),
      inject: (text) => sent(terminal.inject({ptyId: pty.ptyId, text})),
      close: () => stop.abort(),
    }
  }
}
