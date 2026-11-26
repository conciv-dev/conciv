import type {Terminal as Xterm} from '@xterm/xterm'
import type {TtyServerControl} from '@conciv/types/terminal-types'

export type TerminalSize = {cols: number; rows: number}

export type TerminalListener = {
  open(): void
  data(chunk: string | Uint8Array): void
  control(frame: TtyServerControl): void
  closed(): void
}

export type TerminalLink = {
  write(data: string): void
  resize(size: TerminalSize): void
  close(): void
}

export type TerminalTransport = (terminal: Xterm, listener: TerminalListener) => TerminalLink
