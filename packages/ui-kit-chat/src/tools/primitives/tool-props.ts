import type {Component} from 'solid-js'

export interface ToolProps {
  input: Record<string, unknown>
  error?: string
  metadata: Record<string, unknown>
  tool: string
  sessionID?: string
  output?: string
  status?: string
  hideDetails?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  fileOpen?: (path: string) => boolean | undefined
  onFileOpenChange?: (path: string, open: boolean) => void
  deferContent?: boolean
  virtualizeDiff?: boolean
  onContentRendered?: () => void
  pendingFiles?: readonly string[]
  forceOpen?: boolean
  locked?: boolean
}

export type ToolComponent = Component<ToolProps>

export interface ToolEntry {
  readonly name: string
  readonly render?: ToolComponent
  readonly errorComponent?: ToolComponent
  readonly acts?: (name: string) => boolean
}

export type ToolRender = (name: string) => ToolEntry | undefined
