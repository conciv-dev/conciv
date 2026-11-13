import {SESSION_PANES, type SessionPane} from '../../shell/state/session-tabs'

export type PaneTabSnapshot = {
  readonly active: string | undefined
  readonly keys: readonly string[]
}

export type RegionTabSnapshot = {
  readonly session: string

  readonly empty: boolean

  readonly regionActive: string | undefined

  readonly sideOpen: boolean
  readonly panes: Readonly<Record<SessionPane, PaneTabSnapshot>>
}

export type PaneNewTabs = {
  readonly ids: readonly string[]

  readonly chosen: string | undefined
}

export type NewTabsState = {
  readonly serial: number
  readonly session: string

  readonly openedEmpty: boolean
  readonly panes: Readonly<Record<SessionPane, PaneNewTabs>>

  readonly snapshot: RegionTabSnapshot | undefined
}

export type NewTabsEvent =
  | {readonly type: 'sync'; readonly snapshot: RegionTabSnapshot}
  | {readonly type: 'open'; readonly pane: SessionPane}
  | {readonly type: 'select.new'; readonly pane: SessionPane; readonly id: string}
  | {readonly type: 'select.tab'; readonly pane: SessionPane}
  | {readonly type: 'dismiss'; readonly id: string; readonly empty: boolean}

export type NewTabsEffect = {readonly type: 'emptied'}

export type NewTabsTransition = {
  readonly state: NewTabsState
  readonly effects: readonly NewTabsEffect[]
}

export function createNewTabsState(): NewTabsState {
  return {serial: 0, session: '', openedEmpty: false, panes: emptyPanes(), snapshot: undefined}
}

export function transitionNewTabs(state: NewTabsState, event: NewTabsEvent): NewTabsTransition {
  if (event.type === 'sync') return {state: sync(state, event.snapshot), effects: []}

  if (event.type === 'open') return {state: open(state, event.pane), effects: []}

  if (event.type === 'select.new') {
    const pane = state.panes[event.pane]

    if (!pane.ids.includes(event.id) || pane.chosen === event.id) return {state, effects: []}

    return {state: withPane(state, event.pane, {ids: pane.ids, chosen: event.id}), effects: []}
  }

  if (event.type === 'select.tab') {
    const pane = state.panes[event.pane]

    if (pane.chosen === undefined) return {state, effects: []}

    return {state: withPane(state, event.pane, {ids: pane.ids, chosen: undefined}), effects: []}
  }

  const owner = SESSION_PANES.find((pane) => state.panes[pane].ids.includes(event.id))

  if (!owner) return {state, effects: []}

  const pane = state.panes[owner]
  const index = pane.ids.indexOf(event.id)
  const chosen = pane.chosen === event.id ? (pane.ids[index + 1] ?? pane.ids[index - 1]) : pane.chosen
  const next = withPane(state, owner, {ids: pane.ids.filter((id) => id !== event.id), chosen})

  return {state: next, effects: event.empty && !selectHasNewTabs(next) ? [{type: 'emptied'}] : []}
}

export function selectPaneNewTabs(state: NewTabsState, pane: SessionPane) {
  return state.panes[pane].ids
}

export function selectShownNewTab(state: NewTabsState, pane: SessionPane, paneActive: string | undefined) {
  return shown(state.panes[pane], paneActive)
}

export function selectHasNewTabs(state: NewTabsState) {
  return SESSION_PANES.some((pane) => state.panes[pane].ids.length > 0)
}

function sync(state: NewTabsState, snapshot: RegionTabSnapshot): NewTabsState {
  if (snapshot.session !== state.session) {
    const reset = {...state, session: snapshot.session, panes: emptyPanes(), snapshot}
    const openedEmpty = snapshot.sideOpen && snapshot.empty

    return openedEmpty ? open({...reset, openedEmpty}, 'side') : {...reset, openedEmpty}
  }

  const previous = state.snapshot
  const listed = new Set(SESSION_PANES.flatMap((pane) => snapshot.panes[pane].keys))

  const syncPane = (pane: SessionPane): PaneNewTabs => {
    const current = state.panes[pane]
    const next = snapshot.panes[pane]

    if (pane !== 'side' && next.keys.length === 0)
      return current.ids.length === 0 ? current : {ids: [], chosen: undefined}

    if (!previous) return current
    const before = previous.panes[pane]
    const replaced = shown(current, before.active)

    if (!replaced || !replacedBy(before, next, previous.regionActive, listed)) return current

    return {ids: current.ids.filter((id) => id !== replaced), chosen: undefined}
  }

  const panes = {side: syncPane('side'), split: syncPane('split'), bottom: syncPane('bottom')}
  const changed = SESSION_PANES.some((pane) => panes[pane] !== state.panes[pane])

  const synced: NewTabsState = {
    ...state,
    panes: changed ? panes : state.panes,
    snapshot: previous && sameSnapshot(previous, snapshot) ? previous : snapshot,
  }

  const want = snapshot.sideOpen && snapshot.empty
  const opened = want && !state.openedEmpty

  const result =
    opened && selectShownNewTab(synced, 'side', snapshot.panes.side.active) === undefined
      ? open({...synced, openedEmpty: true}, 'side')
      : {...synced, openedEmpty: want}

  if (result.panes === state.panes && result.openedEmpty === state.openedEmpty && result.snapshot === previous)
    return state

  return result
}

function replacedBy(
  before: PaneTabSnapshot,
  next: PaneTabSnapshot,
  regionActive: string | undefined,
  listed: ReadonlySet<string>,
) {
  if (next.active === undefined || next.active === before.active) return false

  if (!before.keys.includes(next.active)) return true

  return (
    (before.active === undefined || next.keys.includes(before.active)) &&
    (regionActive === undefined || listed.has(regionActive))
  )
}

function open(state: NewTabsState, pane: SessionPane): NewTabsState {
  const serial = state.serial + 1
  const id = `new:${serial}`

  return {...withPane(state, pane, {ids: [...state.panes[pane].ids, id], chosen: id}), serial}
}

function shown(pane: PaneNewTabs, paneActive: string | undefined) {
  return pane.chosen ?? (paneActive === undefined ? pane.ids.at(-1) : undefined)
}

function withPane(state: NewTabsState, pane: SessionPane, value: PaneNewTabs): NewTabsState {
  return {...state, panes: {...state.panes, [pane]: value}}
}

function emptyPanes(): Record<SessionPane, PaneNewTabs> {
  return {
    side: {ids: [], chosen: undefined},
    split: {ids: [], chosen: undefined},
    bottom: {ids: [], chosen: undefined},
  }
}

function sameSnapshot(a: RegionTabSnapshot, b: RegionTabSnapshot) {
  return (
    a.session === b.session &&
    a.empty === b.empty &&
    a.regionActive === b.regionActive &&
    a.sideOpen === b.sideOpen &&
    SESSION_PANES.every(
      (pane) =>
        a.panes[pane].active === b.panes[pane].active &&
        a.panes[pane].keys.length === b.panes[pane].keys.length &&
        a.panes[pane].keys.every((key, index) => key === b.panes[pane].keys[index]),
    )
  )
}
