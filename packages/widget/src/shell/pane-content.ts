import {createSignal, createUniqueId, type JSX} from 'solid-js'
import type {SessionClient} from '@conciv/api-client'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import type {PendingApproval} from './approval-modal.js'
import type {ComposerActionDef, ComposerControlDef, PanelDef} from './shell-contract.js'

export type PaneContent = {content: JSX.Element; working: () => boolean; usage: () => UsageSnapshot | null}

export function createPaneContent(opts: {
  panel: PanelDef
  client: SessionClient
  active: () => boolean
  reportApprovals: (key: string, items: PendingApproval[]) => void
  onSessionLabel: (name: string | null) => void
  onNewSession?: () => void | Promise<void>
  announce: (msg: string, assertive?: boolean) => void
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
  build?: (create: () => JSX.Element) => JSX.Element
}): PaneContent {
  const [working, setWorking] = createSignal(false)
  const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
  const approvalKey = createUniqueId()
  const create = () =>
    opts.panel.create({
      active: opts.active,
      onWorkingChange: setWorking,
      onUsageChange: setUsage,
      onApprovalsChange: (items) => opts.reportApprovals(approvalKey, items),
      onSessionLabel: opts.onSessionLabel,
      onNewSession: opts.onNewSession,
      client: opts.client,
      announce: opts.announce,
      composerActions: opts.composerActions,
      composerControls: opts.composerControls,
    })
  const wrap = opts.build ?? ((build) => build())
  return {content: wrap(create), working, usage}
}
