import {createMemo, createSignal, createUniqueId, onCleanup, type JSX} from 'solid-js'
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

export type SlotName = 'leading' | 'trailing' | 'trigger'

export type SlotRender = () => JSX.Element

export type SlotRegistration = {slot: SlotName; render: SlotRender}

type MenuRegistration = {key: string; entry: ActionMenuEntry}

type Registry = {
  actions: RegisteredAction[]
  slots: SlotRegistration[]
  inlineClaims: string[]
  menuEntries: MenuRegistration[]
}

export type PairedSource = Omit<ActionSource, 'inlineContent' | 'menuContent'>

export type PairedRegistration = {
  isInline: () => boolean
  claimInline: () => void
  registerMenuEntry: (entry: ActionMenuEntry) => void
}

export type RegionWidths = {
  row: number
  leading: number
  trailing: number
}

export type ActionsCoordinatorOptions = {
  widths: RegionWidths
  maxInlineAuto?: () => number | undefined
}

export type ActionsCoordinator = {
  register: (source: ActionSource) => string
  registerPaired: (source: PairedSource) => PairedRegistration
  registerSlot: (registration: SlotRegistration) => void
  slotRender: (slot: SlotName) => SlotRender | undefined
  isInline: (key: string) => boolean
  menuActions: () => RegisteredAction[]
  anyCollapsed: () => boolean
}

const EMPTY_REGISTRY: Registry = {actions: [], slots: [], inlineClaims: [], menuEntries: []}

export function createActionsCoordinator(options: ActionsCoordinatorOptions): ActionsCoordinator {
  const [registry, setRegistry] = createSignal<Registry>(EMPTY_REGISTRY)

  const sortedActions = createMemo(() => orderBy(registry().actions, [(action) => action.priority()], ['desc']))
  const fitParticipants = createMemo(() => sortedActions().filter((action) => action.inlineContent()))
  const pinnedActions = createMemo(() => fitParticipants().filter((action) => action.pinned()))
  const autoActions = createMemo(() => fitParticipants().filter((action) => !action.pinned()))

  const fittedAutoCount = createMemo<number | null>((previous) => {
    const measuredRowWidth = options.widths.row
    if (measuredRowWidth === 0) return previous
    return computeVisibleAutoCount({
      rowWidth: measuredRowWidth,
      leadingWidth: options.widths.leading,
      trailingWidth: options.widths.trailing,
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
        ...pinnedActions().map((action) => action.key),
        ...autoActions()
          .slice(0, inlineAutoCount())
          .map((action) => action.key),
      ]),
  )

  const menuActions = createMemo(() =>
    sortedActions().filter((action) => action.menuContent().length > 0 && !inlineKeys().has(action.key)),
  )

  const addAction = (action: RegisteredAction): void => {
    setRegistry((current) => ({...current, actions: [...current.actions, action]}))
    onCleanup(() =>
      setRegistry((current) => ({
        ...current,
        actions: current.actions.filter((existing) => existing.key !== action.key),
      })),
    )
  }

  return {
    register: (source) => {
      const key = createUniqueId()
      addAction({...source, key})
      return key
    },
    registerPaired: (source) => {
      const key = createUniqueId()
      addAction({
        ...source,
        key,
        inlineContent: () => registry().inlineClaims.includes(key),
        menuContent: () =>
          registry()
            .menuEntries.filter((registration) => registration.key === key)
            .map((registration) => registration.entry),
      })
      return {
        isInline: () => inlineKeys().has(key),
        claimInline: () => {
          setRegistry((current) => ({...current, inlineClaims: [...current.inlineClaims, key]}))
          onCleanup(() =>
            setRegistry((current) => {
              const index = current.inlineClaims.indexOf(key)
              if (index === -1) return current
              return {
                ...current,
                inlineClaims: [...current.inlineClaims.slice(0, index), ...current.inlineClaims.slice(index + 1)],
              }
            }),
          )
        },
        registerMenuEntry: (entry) => {
          setRegistry((current) => ({...current, menuEntries: [...current.menuEntries, {key, entry}]}))
          onCleanup(() =>
            setRegistry((current) => ({
              ...current,
              menuEntries: current.menuEntries.filter((registration) => registration.entry.key !== entry.key),
            })),
          )
        },
      }
    },
    registerSlot: (registration) => {
      setRegistry((current) => ({...current, slots: [...current.slots, registration]}))
      onCleanup(() =>
        setRegistry((current) => ({
          ...current,
          slots: current.slots.filter((existing) => existing !== registration),
        })),
      )
    },
    slotRender: (slot) => registry().slots.findLast((registration) => registration.slot === slot)?.render,
    isInline: (key) => inlineKeys().has(key),
    menuActions,
    anyCollapsed: () => menuActions().length > 0,
  }
}
