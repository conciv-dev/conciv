import {Terminal as Xterm} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import type {DockRenderer} from '@devframes/hub/client'
import {injectXtermCss} from '@conciv/ui-kit-terminal'
import {SessionId} from '@conciv/protocol/chat-types'
import {TERMINAL_OUTPUT_CHANNEL, type TerminalDockEntry} from './shared/devframe-protocol.js'

export const SESSION_ATTRIBUTE = 'data-conciv-session'

function requestedSession(container: HTMLElement): SessionId | undefined {
  const value = container.getAttribute(SESSION_ATTRIBUTE)
  return value ? SessionId.parse(value) : undefined
}

export const terminalDockRenderer: DockRenderer<TerminalDockEntry> = ({container, context}) => {
  const rpc = context.rpc
  injectXtermCss(container.getRootNode())
  const terminal = new Xterm({convertEol: false, scrollback: 5000, fontSize: 13})
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  terminal.open(container)
  fit.fit()
  const live: {sessionId: SessionId | null; closed: boolean} = {sessionId: null, closed: false}

  const pump = async (streamId: string): Promise<void> => {
    for await (const chunk of rpc.streaming.subscribe<string>(TERMINAL_OUTPUT_CHANNEL, streamId)) {
      if (live.closed) return
      terminal.write(chunk)
    }
  }

  void rpc
    .call('conciv-terminal:open', {
      sessionId: requestedSession(container),
      cols: terminal.cols,
      rows: terminal.rows,
    })
    .then(({sessionId, streamId}) => {
      live.sessionId = SessionId.parse(sessionId)
      fit.fit()
      void rpc.call('conciv-terminal:resize', {sessionId: live.sessionId, cols: terminal.cols, rows: terminal.rows})
      return pump(streamId)
    })
    .catch((error: unknown) => terminal.write(`\r\n\x1b[31m${String(error)}\x1b[0m\r\n`))

  const input = terminal.onData((data) => {
    if (live.sessionId) void rpc.call('conciv-terminal:write', {sessionId: live.sessionId, data})
  })
  const observer = new ResizeObserver(() => {
    fit.fit()
    if (live.sessionId)
      void rpc.call('conciv-terminal:resize', {sessionId: live.sessionId, cols: terminal.cols, rows: terminal.rows})
  })
  observer.observe(container)

  return {
    dispose: () => {
      live.closed = true
      observer.disconnect()
      input.dispose()
      terminal.dispose()
    },
  }
}

export default terminalDockRenderer
