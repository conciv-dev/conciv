import {untrack} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Terminal as Xterm, type ITheme} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {AsyncRetryer} from '@tanstack/pacer/async-retryer'
import type {TtyServerControl} from '@conciv/types/terminal-types'
import type {TerminalLink, TerminalListener, TerminalTransport} from './transport.js'

const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 8000
const CONNECT_ATTEMPTS = 7
const FEWEST_CELLS = 2
const MOST_CELLS = 500

const LOST_CONNECTION = 'Lost connection to the terminal.'
const COULD_NOT_OPEN = 'Could not open the terminal.'
const COULD_NOT_REACH = 'Could not reach the terminal.'
const CONNECTION_DROPPED = 'The terminal connection dropped.'

export type TerminalTheme = ITheme
export type TerminalStatus = 'idle' | 'connecting' | 'open' | 'exited' | 'error' | 'closed'

export type TerminalModelOpts = {
  transport: TerminalTransport
  beforeConnect?: (terminal: Xterm) => Promise<void> | void
  theme?: () => TerminalTheme
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
  paste(text: string): void
  sendInput(data: string): void
}

type TerminalSession = {
  status: TerminalStatus
  busy: boolean
  exitCode: number | null
  errorMessage: string | null
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
  const [session, setSession] = createStore<TerminalSession>({
    status: 'idle',
    busy: false,
    exitCode: null,
    errorMessage: null,
  })

  const terminal = new Xterm({
    convertEol: false,
    scrollback: 5000,
    fontSize: 13,
    screenReaderMode: true,
    theme: opts.theme?.(),
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  const live: {link: TerminalLink | null} = {link: null}

  const settled = (): boolean =>
    session.status === 'exited' || session.status === 'error' || session.status === 'closed'

  const giveUp = (message: string): void => setSession({status: 'error', errorMessage: message})

  const receiveControl = (frame: TtyServerControl): void => {
    if (frame.type === 'exit') {
      setSession({status: 'exited', exitCode: frame.code})
      return
    }
    if (frame.type === 'busy') {
      setSession({busy: frame.busy})
      return
    }
    setSession({status: 'error', errorMessage: frame.message})
  }

  const openLink = (): TerminalLink | null => (untrack(() => session.status) === 'open' ? live.link : null)

  const engineTakesSize = (): boolean =>
    Math.min(terminal.cols, terminal.rows) >= FEWEST_CELLS && Math.max(terminal.cols, terminal.rows) <= MOST_CELLS

  const sizedForEngine = (): Promise<void> =>
    new Promise((resolve) => {
      if (engineTakesSize()) {
        resolve()
        return
      }
      const listener = terminal.onResize(() => {
        if (!engineTakesSize()) return
        listener.dispose()
        resolve()
      })
    })

  const sendResize = (): void => {
    if (engineTakesSize()) openLink()?.resize({cols: terminal.cols, rows: terminal.rows})
  }

  const holdSession = (): Promise<boolean> =>
    new Promise<boolean>((resolve, reject) => {
      const listener: TerminalListener = {
        open: () => {
          if (settled()) return
          if (opts.theme) terminal.options.theme = opts.theme()
          setSession({status: 'open'})
          sendResize()
        },
        data: (chunk) => terminal.write(chunk),
        control: receiveControl,
        closed: () => {
          live.link = null
          if (settled()) {
            resolve(false)
            return
          }
          const wasEstablished = session.status === 'open'
          setSession({status: 'connecting'})
          if (wasEstablished) {
            resolve(true)
            return
          }
          reject(new Error(CONNECTION_DROPPED))
        },
      }
      try {
        live.link = opts.transport(terminal, listener)
      } catch {
        giveUp(COULD_NOT_REACH)
        resolve(false)
      }
    })

  const prepare = async (): Promise<boolean> => {
    try {
      await opts.beforeConnect?.(terminal)
      return true
    } catch (error) {
      giveUp(error instanceof Error ? error.message : COULD_NOT_OPEN)
      return false
    }
  }

  const attemptSession = async (): Promise<boolean> => {
    await sizedForEngine()
    const ready = await prepare()
    if (!ready || settled()) return false
    return holdSession()
  }

  const retryer = new AsyncRetryer(attemptSession, {
    maxAttempts: CONNECT_ATTEMPTS,
    backoff: 'exponential',
    baseWait: RETRY_BASE_MS,
    maxWait: RETRY_MAX_MS,
    throwOnError: false,
    onLastError: () => giveUp(LOST_CONNECTION),
  })

  const runEpisodes = async (): Promise<void> => {
    let dropped = await retryer.execute()
    while (dropped) dropped = await retryer.execute()
  }

  terminal.onData((data) => openLink()?.write(data))

  return {
    terminal,
    status: () => session.status,
    busy: () => session.busy,
    exitCode: () => session.exitCode,
    errorMessage: () => session.errorMessage,
    connect: () => {
      if (session.status !== 'idle') return
      setSession({status: 'connecting'})
      void runEpisodes()
    },
    disconnect: () => {
      setSession({status: 'closed'})
      retryer.abort()
      live.link?.close()
      live.link = null
      terminal.dispose()
    },
    fit: () => {
      fitAddon.fit()
      if (Math.max(terminal.cols, terminal.rows) > MOST_CELLS)
        terminal.resize(Math.min(terminal.cols, MOST_CELLS), Math.min(terminal.rows, MOST_CELLS))
      sendResize()
    },
    focus: () => terminal.focus(),
    paste: (text) => terminal.paste(text),
    sendInput: (data) => openLink()?.write(data),
  }
}
