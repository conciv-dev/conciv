import {createEffect, createSignal, type JSX} from 'solid-js'
import {defineClient, type SessionClient} from '@conciv/api-client'
import {SessionId, isSessionId} from '@conciv/protocol/chat-types'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import type {PendingApproval} from './approval-modal.js'
import type {ComposerActionDef, ComposerControlDef, PanelDef} from './shell-contract.js'
import {mergeSurface, makeSurfaceRow, invalidateSessions} from '../client/session-store-client.js'
import {readStorage, writeStorage} from '../lib/persisted-signal.js'
import {createPaneContent} from './pane-content.js'

export type QuickPane = {
  id: number
  client: SessionClient
  content: JSX.Element
  usage: () => UsageSnapshot | null
  working: () => boolean
}

const PANES_KEY = 'conciv-qt-panes'
const FOCUS_KEY = 'conciv-qt-focused'

const readPaneIds = (): string[] =>
  readStorage(
    PANES_KEY,
    (raw) => {
      const arr: unknown = JSON.parse(raw)
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : undefined
    },
    [],
  )

const writePaneIds = (ids: (string | null)[]) =>
  writeStorage(
    PANES_KEY,
    ids.filter((x): x is string => Boolean(x)),
    JSON.stringify,
  )

const readFocusIndex = (): number =>
  readStorage(
    FOCUS_KEY,
    (raw) => {
      const n = Number(raw)
      return Number.isInteger(n) && n >= 0 ? n : undefined
    },
    0,
  )

const forgetSession = (client: SessionClient) => {
  if (client.sessionId()) void client.remove().catch(() => {})
}

const resolvePaneClient = (apiBase: string, initialId?: string): SessionClient => {
  const client = defineClient({apiBase})
  if (initialId && isSessionId(initialId)) client.setSessionId(SessionId.parse(initialId))
  else void client.resolve().then((r) => client.setSessionId(r.sessionId))
  return client
}

export function createQuickPanes(opts: {
  panel: PanelDef
  open: () => boolean
  setOpen: (v: boolean) => void
  reportApprovals: (key: string, items: PendingApproval[]) => void
  announce: (msg: string, assertive?: boolean) => void
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
  onReflow: () => void
}): {
  apiBase: string
  panes: () => QuickPane[]
  focused: () => number
  focusPane: (id: number) => void
  addPane: (initialId?: string) => void
  closePane: (id: number) => void
} {
  const apiBase = opts.panel.apiBase ?? ''
  const [panes, setPanes] = createSignal<QuickPane[]>([])
  const [focused, setFocused] = createSignal(0)
  let seq = 0

  const paneIds = (): (string | null)[] => panes().map((pane) => pane.client.sessionId())

  const focusPane = (id: number) => {
    setFocused(id)
    const idx = panes().findIndex((pane) => pane.id === id)
    if (idx >= 0) writeStorage(FOCUS_KEY, idx)
  }

  const labelMerger = (client: SessionClient) => (name: string | null) => {
    const sid = client.sessionId()
    mergeSurface(sid, sid ? makeSurfaceRow(sid, name) : null)
  }

  const addPane = (initialId?: string) => {
    const id = ++seq
    const client = resolvePaneClient(apiBase, initialId)
    const pane = createPaneContent({
      panel: opts.panel,
      client,
      active: () => opts.open() && focused() === id,
      reportApprovals: opts.reportApprovals,
      onSessionLabel: labelMerger(client),
      announce: opts.announce,
      composerActions: opts.composerActions,
      composerControls: opts.composerControls,
    })
    setPanes((ps) => [...ps, {id, client, content: pane.content, usage: pane.usage, working: pane.working}])
    writePaneIds(paneIds())
    void invalidateSessions(apiBase)
    focusPane(id)
  }

  const retirePane = (remaining: QuickPane[], closedId: number) => {
    const refocus = focused() === closedId
    setPanes(remaining)
    const lastPane = remaining.at(-1)
    if (refocus && lastPane) focusPane(lastPane.id)
    opts.onReflow()
  }

  const closePane = (id: number) => {
    const target = panes().find((pane) => pane.id === id)
    const remaining = panes().filter((pane) => pane.id !== id)
    if (target) forgetSession(target.client)
    writePaneIds(remaining.map((pane) => pane.client.sessionId()))
    void invalidateSessions(apiBase)
    if (remaining.length === 0) {
      opts.setOpen(false)
      return
    }
    retirePane(remaining, id)
  }

  const restore = () => {
    const savedIds = readPaneIds()
    if (savedIds.length === 0) {
      addPane()
      return
    }
    for (const sid of savedIds) addPane(sid)
  }
  restore()

  let wasOpen = false
  let restoreFocus: HTMLElement | null = null
  const captureAndRestoreFocusTarget = () => {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = panes()[Math.min(readFocusIndex(), panes().length - 1)]
    if (target) setFocused(target.id)
  }
  const releaseFocus = () => {
    restoreFocus?.focus()
    restoreFocus = null
  }
  createEffect(() => {
    const open = opts.open()
    if (open === wasOpen) return
    wasOpen = open
    if (open) captureAndRestoreFocusTarget()
    else releaseFocus()
  })

  return {apiBase, panes, focused, focusPane, addPane, closePane}
}
