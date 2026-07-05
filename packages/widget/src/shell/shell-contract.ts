import type {JSX, Component} from 'solid-js'
import type {SessionClient} from '@conciv/api-client'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import type {Grab} from '@conciv/grab'
import type {PendingApproval} from './approval-modal.js'

export type PanelContext = {
  active: () => boolean

  onWorkingChange: (working: boolean) => void

  onUsageChange: (usage: UsageSnapshot | null) => void

  onApprovalsChange: (approvals: PendingApproval[]) => void

  client: SessionClient

  onSessionLabel?: (name: string | null) => void

  onNewSession?: () => void | Promise<void>

  announce?: (msg: string, assertive?: boolean) => void

  composerActions: () => ComposerActionDef[]

  composerControls: () => ComposerControlDef[]
}
export type PanelDef = {
  id: string
  title: string

  apiBase?: string
  create: (ctx: PanelContext) => JSX.Element
}

export type ComposerActionContext = {
  insert: (text: string) => void

  stageGrab: (grab: Grab) => void
  setBusy: (busy: boolean) => void
  apiBase: string

  client: SessionClient

  addDivider: (kind: 'new' | 'compact') => void
  newSession: () => void | Promise<void>
  resetUsage: () => void
  compact: () => Promise<void>
  notify: (message: string) => void
  requestMeta: () => Record<string, unknown>
}

export type ComposerActionDef = {
  id: string
  label: string
  icon: Component<{class?: string}>
  onClick: (ctx: ComposerActionContext) => void | Promise<void>
}

export type ComposerControlContext = {
  apiBase: string
  setRequestMeta: (patch: Record<string, unknown>) => void
}

export type ComposerControlDef = {
  id: string
  create: (ctx: ComposerControlContext) => JSX.Element
}

export const CLOSE =
  'bg-transparent [border:none] text-pw-text-2 text-[1.375rem] cursor-pointer inline-flex items-center justify-center size-9.5 rounded-[0.5625rem] trans-color-bg hover:text-pw-text hover:bg-pw-fill-strong'
