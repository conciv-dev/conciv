import type {DevframeDockEntryBase} from '@devframes/hub/types'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'

export const TERMINAL_DOCK_TYPE = 'conciv-terminal'
export const TERMINAL_OUTPUT_CHANNEL = 'conciv-terminal:output'

export type TerminalFrame = {kind: 'data'; data: string} | {kind: 'control'; control: TtyServerControl}

export type TerminalDockEntry = DevframeDockEntryBase & {type: typeof TERMINAL_DOCK_TYPE}

declare module '@devframes/hub/types' {
  interface DevframeDockEntryRegistry {
    'conciv-terminal': TerminalDockEntry
  }
}
