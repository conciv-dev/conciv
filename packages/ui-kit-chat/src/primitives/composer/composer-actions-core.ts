import {batch, createEffect, createMemo, createSignal, createUniqueId, onCleanup, untrack, type JSX} from 'solid-js'
import {orderBy} from 'es-toolkit'
import {ACTION_SLOT_PX, computeVisibleAutoCount, FIT_HYSTERESIS_PX, REGION_GAP_PX} from './composer-actions-fit.js'

export type ActionMenuEntry = {
  key: string
  label: () => JSX.Element
  icon: () => JSX.Element
  onSelect: () => void
}

export type ActionSource = {
  priority: () => number
  pinned: () => boolean
  disabled: () => boolean
  inlineContent: () => boolean
  menuContent: () => ActionMenuEntry[]
}

export type RegisteredAction = ActionSource & {key: string}

export type ActionsCoordinatorOptions = {
  maxInlineAuto?: () => number | undefined
  onOverflowDismissed?: () => void
}

export type ActionsCoordinator = {
  register: (source: ActionSource) => string
  isInline: (key: string) => boolean
  menuActions: () => RegisteredAction[]
  anyCollapsed: () => boolean
  menuOpen: () => boolean
  setMenuOpen: (open: boolean) => void
  setRowWidth: (width: number) => void
  setLeadingWidth: (width: number) => void
  setTrailingWidth: (width: number) => void
}

export function createActionsCoordinator(options: ActionsCoordinatorOptions): ActionsCoordinator {
  const [actions, setActions] = createSignal<RegisteredAction[]>([])
  const [rowWidth, setRowWidth] = createSignal(0)
  const [leadingWidth, setLeadingWidth] = createSignal(0)
  const [trailingWidth, setTrailingWidth] = createSignal(0)
  const [menuRequested, setMenuRequested] = createSignal(false)

  const sortedActions = createMemo(() => orderBy(actions(), [(entry) => entry.priority()], ['desc']))
  const fitParticipants = createMemo(() => sortedActions().filter((entry) => entry.inlineContent()))
  const pinnedActions = createMemo(() => fitParticipants().filter((entry) => entry.pinned()))
  const autoActions = createMemo(() => fitParticipants().filter((entry) => !entry.pinned()))

  const fittedAutoCount = createMemo<number | null>((previous) => {
    const measuredRowWidth = rowWidth()
    if (measuredRowWidth === 0) return previous
    return computeVisibleAutoCount({
      rowWidth: measuredRowWidth,
      leadingWidth: leadingWidth(),
      trailingWidth: trailingWidth(),
      slotWidth: ACTION_SLOT_PX,
      regionGapPx: REGION_GAP_PX,
      pinnedCount: pinnedActions().length,
      autoCount: autoActions().length,
      previousCount: previous,
      hysteresisPx: FIT_HYSTERESIS_PX,
    })
  }, null)

  const inlineAutoCount = createMemo(() => {
    const fitted = fittedAutoCount() ?? 0
    const cap = options.maxInlineAuto?.()
    return cap === undefined ? fitted : Math.min(fitted, cap)
  })

  const inlineKeys = createMemo(
    () =>
      new Set([
        ...pinnedActions().map((entry) => entry.key),
        ...autoActions()
          .slice(0, inlineAutoCount())
          .map((entry) => entry.key),
      ]),
  )

  const menuActions = createMemo(() =>
    sortedActions().filter((entry) => entry.menuContent().length > 0 && !inlineKeys().has(entry.key)),
  )
  const anyCollapsed = createMemo(() => menuActions().length > 0)

  createEffect(() => {
    if (anyCollapsed()) return
    if (!untrack(menuRequested)) return
    batch(() => {
      setMenuRequested(false)
      options.onOverflowDismissed?.()
    })
  })

  return {
    register: (source) => {
      const key = createUniqueId()
      setActions((current) => [...current, {...source, key}])
      onCleanup(() => setActions((current) => current.filter((entry) => entry.key !== key)))
      return key
    },
    isInline: (key) => inlineKeys().has(key),
    menuActions,
    anyCollapsed,
    menuOpen: () => menuRequested() && anyCollapsed(),
    setMenuOpen: setMenuRequested,
    setRowWidth,
    setLeadingWidth,
    setTrailingWidth,
  }
}
