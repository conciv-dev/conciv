import {createSignal} from 'solid-js'
import {Terminal as Xterm, type ITheme} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {TtyServerControlSchema, type TtyServerControl} from '@conciv/protocol/terminal-types'

const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 8000
const RETRY_LIMIT = 6

export type TerminalTheme = ITheme
export type TerminalStatus = 'idle' | 'connecting' | 'open' | 'exited' | 'error'

export type TerminalModelOpts = {
  url: () => string
  theme?: () => TerminalTheme
  fontSize?: number
}

export type TerminalModel = {
  terminal: Xterm
  status: () => TerminalStatus
  busy: () => boolean
  exitCode: () => number | null
  errorMessage: () => string | null
  connect(): void
  disconnect(): void
  fit(): void
  focus(): void
  inject(text: string): void
  paste(text: string): void
  __testReceiveControl(frame: TtyServerControl): void
}

export function translateBuffer(terminal: Xterm): string {
  const buffer = terminal.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i += 1) {
    const line = buffer.getLine(i)
    if (line) lines.push(line.translateToString(true))
  }
  return lines.join('\n')
}

export function createTerminalModel(opts: TerminalModelOpts): TerminalModel {
  const [status, setStatus] = createSignal<TerminalStatus>('idle')
  const [busy, setBusy] = createSignal(false)
  const [exitCode, setExitCode] = createSignal<number | null>(null)
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)

  const terminal = new Xterm({
    convertEol: false,
    scrollback: 5000,
    fontSize: opts.fontSize ?? 13,
    screenReaderMode: true,
    theme: opts.theme?.(),
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  const state: {
    socket: WebSocket | null
    retry: ReturnType<typeof setTimeout> | null
    stopped: boolean
    attempts: number
  } = {
    socket: null,
    retry: null,
    stopped: false,
    attempts: 0,
  }

  const receiveControl = (frame: TtyServerControl): void => {
    if (frame.type === 'exit') {
      setExitCode(frame.code)
      setStatus('exited')
      return
    }
    if (frame.type === 'busy') {
      setBusy(frame.busy)
      return
    }
    setErrorMessage(frame.message)
    setStatus('error')
  }

  const sendResize = (): void => {
    if (state.socket?.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({type: 'resize', cols: terminal.cols, rows: terminal.rows}))
    }
  }

  const settled = (): boolean => status() === 'exited' || status() === 'error' || state.stopped

  const giveUp = (message: string): void => {
    setErrorMessage(message)
    setStatus('error')
  }

  const scheduleRetry = (): void => {
    if (settled()) return
    state.attempts += 1
    if (state.attempts > RETRY_LIMIT) {
      giveUp('Lost connection to the terminal.')
      return
    }
    setStatus('connecting')
    const delay = Math.min(RETRY_BASE_MS * 2 ** (state.attempts - 1), RETRY_MAX_MS)
    state.retry = setTimeout(connect, delay)
  }

  const connect = (): void => {
    if (state.socket || settled()) return
    setStatus('connecting')
    const socket = openSocket()
    if (!socket) return
    socket.binaryType = 'arraybuffer'
    state.socket = socket
    socket.addEventListener('open', () => {
      state.attempts = 0
      if (opts.theme) terminal.options.theme = opts.theme()
      setStatus('open')
      sendResize()
    })
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        terminal.write(new Uint8Array(event.data as ArrayBuffer))
        return
      }
      const parsed = safeControl(event.data)
      if (parsed) receiveControl(parsed)
    })
    socket.addEventListener('close', () => {
      state.socket = null
      scheduleRetry()
    })
  }

  const openSocket = (): WebSocket | null => {
    try {
      return new WebSocket(opts.url())
    } catch {
      giveUp('Could not reach the terminal.')
      return null
    }
  }

  terminal.onData((data) => {
    if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(data)
  })

  return {
    terminal,
    status,
    busy,
    exitCode,
    errorMessage,
    connect,
    disconnect: () => {
      state.stopped = true
      if (state.retry) clearTimeout(state.retry)
      state.socket?.close()
      state.socket = null
      terminal.dispose()
    },
    fit: () => {
      fitAddon.fit()
      sendResize()
    },
    focus: () => terminal.focus(),
    inject: (text) => {
      if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({type: 'inject', text}))
    },
    paste: (text) => terminal.paste(text),
    __testReceiveControl: receiveControl,
  }
}

function safeControl(raw: string): TtyServerControl | null {
  try {
    const parsed = TtyServerControlSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
