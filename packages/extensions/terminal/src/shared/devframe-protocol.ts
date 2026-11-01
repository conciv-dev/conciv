import type {DevframeDockEntryBase} from '@devframes/hub/types'

export const TERMINAL_DOCK_TYPE = 'conciv-terminal'
export const TERMINAL_OUTPUT_CHANNEL = 'devframe:terminals'

export type TerminalDockEntry = DevframeDockEntryBase & {type: typeof TERMINAL_DOCK_TYPE}

declare module '@devframes/hub/types' {
  interface DevframeDockEntryRegistry {
    'conciv-terminal': TerminalDockEntry
  }
}
