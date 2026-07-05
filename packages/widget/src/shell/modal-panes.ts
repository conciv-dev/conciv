import {createEffect, createSignal, getOwner, runWithOwner, type JSX} from 'solid-js'
import {defineClient} from '@conciv/api-client'
import {SessionId, isSessionId} from '@conciv/protocol/chat-types'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import type {PendingApproval} from './approval-modal.js'
import type {ComposerActionDef, ComposerControlDef, PanelDef} from './shell-contract.js'
import {mergeSurface, makeSurfaceRow} from '../client/session-store-client.js'
import {readStorage, writeStorage} from '../lib/persisted-signal.js'
import {readShellSnapshotOrDefault} from '../lib/ui-snapshot.js'
import {createPaneContent} from './pane-content.js'

export type ModalPane = {id: SessionId; content: JSX.Element; working: () => boolean; usage: () => UsageSnapshot | null}

const parseActiveId = (raw: string): SessionId | undefined => (isSessionId(raw) ? SessionId.parse(raw) : undefined)

export function createModalPanes(opts: {
  panel: PanelDef
  open: () => boolean
  reportApprovals: (key: string, items: PendingApproval[]) => void
  announce: (msg: string, assertive?: boolean) => void
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
}): {
  apiBase: string
  panes: () => ModalPane[]
  paneIds: () => SessionId[]
  activeId: () => SessionId | null
  activate: (id: SessionId) => void
  working: () => boolean
  usage: () => UsageSnapshot | null
} {
  const apiBase = opts.panel.apiBase ?? ''
  const owner = getOwner()
  const [activeId, setActiveId] = createSignal<SessionId | null>(null)
  const [panes, setPanes] = createSignal<ModalPane[]>([])
  createEffect(() => writeStorage('conciv-active-session', activeId()))

  const mountPane = (id: SessionId) => {
    if (panes().some((pane) => pane.id === id)) return
    const client = defineClient({apiBase})
    client.setSessionId(id)
    const pane = createPaneContent({
      panel: opts.panel,
      client,
      active: () => opts.open() && activeId() === id,
      reportApprovals: opts.reportApprovals,
      onSessionLabel: (name) => mergeSurface(id, makeSurfaceRow(id, name)),
      onNewSession: () => void activateNew(),
      announce: opts.announce,
      composerActions: opts.composerActions,
      composerControls: opts.composerControls,
      build: (create) => runWithOwner(owner, create),
    })
    setPanes((prev) => [...prev, {id, content: pane.content, working: pane.working, usage: pane.usage}])
  }

  const activate = (id: SessionId) => {
    mountPane(id)
    setActiveId(id)
  }

  const activateNew = async () => {
    const {sessionId} = await defineClient({apiBase}).resolve()
    activate(sessionId)
  }

  const restore = () => {
    for (const id of readShellSnapshotOrDefault().paneIds.filter(isSessionId)) mountPane(id)
    const restored = readStorage('conciv-active-session', parseActiveId, undefined)
    if (restored) activate(restored)
    else void activateNew()
  }
  restore()

  const activePane = () => panes().find((pane) => pane.id === activeId())
  const working = () => activePane()?.working() ?? false
  const usage = () => activePane()?.usage() ?? null
  const paneIds = () => panes().map((pane) => pane.id)

  return {apiBase, panes, paneIds, activeId, activate, working, usage}
}
