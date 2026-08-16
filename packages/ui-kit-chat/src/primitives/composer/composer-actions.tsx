import {
  batch,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  Show,
  splitProps,
  untrack,
  useContext,
  type JSX,
} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Portal} from 'solid-js/web'
import {makeResizeObserver} from '@solid-primitives/resize-observer'
import {Menu, TooltipIconButton, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {keyBy, orderBy} from 'es-toolkit'
import {ACTION_SLOT_PX, computeVisibleAutoCount, FIT_HYSTERESIS_PX, REGION_GAP_PX} from './composer-actions-fit.js'

type Registration = {
  key: string
  id: string
  priority: number
  pinned: boolean
  hasButton: boolean
  itemCount: number
  disabled: () => boolean
}

type Coordinator = {
  register: (entry: Registration) => void
  update: (key: string, patch: Partial<Omit<Registration, 'key'>>) => void
  adjustItemCount: (key: string, delta: number) => void
  unregister: (key: string) => void
  active: (key: string) => boolean
  inline: (key: string) => boolean
  groupMount: (key: string) => HTMLElement | undefined
}

type RootState = {
  key: string
  id: string
  priority: number
  disabled: () => boolean
  inline: () => boolean
  update: (patch: Partial<Omit<Registration, 'key' | 'id'>>) => void
  adjustItemCount: (delta: number) => void
}

const TRIGGER_TOOLTIP = 'More composer actions'
const TRIGGER_CLASS = 'size-8.5'
const ACTION_CLASS = 'size-8.5'
const REGION_CLASS = 'empty:hidden flex gap-1 items-center'

const CoordinatorContext = createContext<Coordinator>()
const RootContext = createContext<RootState>()

export type ComposerActionsHostProps = {
  leading?: JSX.Element
  trailing: JSX.Element
  triggerContent: JSX.Element
  onOverflowDismissed?: () => void
  children: JSX.Element
}

export function ComposerActionsHost(props: ComposerActionsHostProps): JSX.Element {
  const [local] = splitProps(props, ['leading', 'trailing', 'triggerContent', 'onOverflowDismissed', 'children'])
  const [registrations, setRegistrations] = createStore<Registration[]>([])
  const [groupNodes, setGroupNodes] = createStore<Record<string, HTMLElement | undefined>>({})
  const [rowElement, setRowElement] = createSignal<HTMLElement>()
  const [leadingElement, setLeadingElement] = createSignal<HTMLElement>()
  const [trailingElement, setTrailingElement] = createSignal<HTMLElement>()
  const [rowWidth, setRowWidth] = createSignal(0)
  const [leadingWidth, setLeadingWidth] = createSignal(0)
  const [trailingWidth, setTrailingWidth] = createSignal(0)
  const [menuOpen, setMenuOpen] = createSignal(false)
  const warnedIds = new Set<string>()

  const applyMeasuredEntry = (entry: ResizeObserverEntry): void =>
    untrack(() => {
      if (entry.target === rowElement()) setRowWidth(entry.contentRect.width)
      if (entry.target === leadingElement()) setLeadingWidth(entry.contentRect.width)
      if (entry.target === trailingElement()) setTrailingWidth(entry.contentRect.width)
    })

  const {observe} = makeResizeObserver((entries) => batch(() => entries.forEach(applyMeasuredEntry)))

  createEffect(() => {
    for (const element of [rowElement(), leadingElement(), trailingElement()]) {
      if (element === undefined) continue
      observe(element)
    }
  })

  const indexOfKey = (key: string): number => registrations.findIndex((entry) => entry.key === key)

  const activeKeys = createMemo(
    () => new Set(Object.values(keyBy([...registrations], (entry) => entry.id)).map((entry) => entry.key)),
  )
  const activeRoots = createMemo(() => registrations.filter((entry) => activeKeys().has(entry.key)))
  const sortedActiveRoots = createMemo(() => orderBy(activeRoots(), [(entry) => entry.priority], ['desc']))
  const pinnedRoots = createMemo(() => activeRoots().filter((entry) => entry.hasButton && entry.pinned))
  const autoRoots = createMemo(() =>
    orderBy(
      activeRoots().filter((entry) => entry.hasButton && !entry.pinned),
      [(entry) => entry.priority],
      ['desc'],
    ),
  )

  const visibleAutoCount = createMemo<number | null>((previous) => {
    const measuredRowWidth = rowWidth()
    if (measuredRowWidth === 0) return previous
    return computeVisibleAutoCount({
      rowWidth: measuredRowWidth,
      leadingWidth: leadingWidth(),
      trailingWidth: trailingWidth(),
      slotWidth: ACTION_SLOT_PX,
      regionGapPx: REGION_GAP_PX,
      pinnedCount: pinnedRoots().length,
      autoCount: autoRoots().length,
      previousCount: previous,
      hysteresisPx: FIT_HYSTERESIS_PX,
    })
  }, null)

  const inlineKeys = createMemo(
    () =>
      new Set([
        ...pinnedRoots().map((entry) => entry.key),
        ...autoRoots()
          .slice(0, visibleAutoCount() ?? 0)
          .map((entry) => entry.key),
      ]),
  )

  const anyCollapsed = createMemo(() =>
    activeRoots().some((entry) => entry.itemCount > 0 && !inlineKeys().has(entry.key)),
  )

  const coordinator: Coordinator = {
    register: (entry) => {
      if (registrations.some((existing) => existing.id === entry.id) && !warnedIds.has(entry.id)) {
        warnedIds.add(entry.id)
        console.warn(`ComposerActions: duplicate root id "${entry.id}" — the last registration wins`)
      }
      setRegistrations(registrations.length, entry)
    },
    update: (key, patch) => {
      const index = indexOfKey(key)
      if (index < 0) return
      setRegistrations(index, patch)
    },
    adjustItemCount: (key, delta) => {
      const index = indexOfKey(key)
      if (index < 0) return
      setRegistrations(index, 'itemCount', (previous) => previous + delta)
    },
    unregister: (key) => setRegistrations((current) => current.filter((entry) => entry.key !== key)),
    active: (key) => activeKeys().has(key),
    inline: (key) => inlineKeys().has(key),
    groupMount: (key) => groupNodes[key],
  }

  createEffect(() => {
    if (anyCollapsed()) return
    if (!menuOpen()) return
    setMenuOpen(false)
    local.onOverflowDismissed?.()
  })

  return (
    <CoordinatorContext.Provider value={coordinator}>
      <Menu.Root open={menuOpen()} onOpenChange={(details) => setMenuOpen(details.open)}>
        <div ref={setRowElement} class="pt-0.5 flex gap-1 items-center">
          <div ref={setLeadingElement} class={REGION_CLASS}>
            {local.leading}
          </div>
          {local.children}
          <Show
            when={anyCollapsed()}
            fallback={<span aria-hidden="true" class={`${ACTION_CLASS} shrink-0 invisible`} />}
          >
            <TooltipIconButtonSlot tooltip={TRIGGER_TOOLTIP} class={TRIGGER_CLASS}>
              {(buttonProps) => (
                <Menu.Trigger
                  asChild={(triggerProps) => (
                    <button {...buttonProps()} {...triggerProps()}>
                      {local.triggerContent}
                    </button>
                  )}
                />
              )}
            </TooltipIconButtonSlot>
          </Show>
          <div ref={setTrailingElement} class={`ml-auto ${REGION_CLASS}`}>
            {local.trailing}
          </div>
        </div>
        <Menu.Positioner>
          <Menu.Content aria-label={TRIGGER_TOOLTIP}>
            <For each={sortedActiveRoots()}>
              {(entry) => {
                onCleanup(() => setGroupNodes(entry.key, undefined))
                return <div ref={(element) => setGroupNodes(entry.key, element)} />
              }}
            </For>
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>
    </CoordinatorContext.Provider>
  )
}

export type ComposerActionsRootProps = {
  id: string
  priority?: number
  disabled?: () => boolean
  children: JSX.Element
}

function Root(props: ComposerActionsRootProps): JSX.Element {
  const coordinator = useContext(CoordinatorContext)
  if (coordinator === undefined) return null
  const [local] = splitProps(props, ['id', 'priority', 'disabled', 'children'])
  const key = createUniqueId()
  const disabled = (): boolean => local.disabled?.() === true
  const priority = (): number => local.priority ?? 0

  coordinator.register(
    untrack(() => ({
      key,
      id: local.id,
      priority: priority(),
      pinned: false,
      hasButton: false,
      itemCount: 0,
      disabled,
    })),
  )
  onCleanup(() => coordinator.unregister(key))
  createEffect(() => coordinator.update(key, {priority: priority(), disabled}))

  const state: RootState = {
    key,
    get id() {
      return local.id
    },
    get priority() {
      return priority()
    },
    disabled,
    inline: () => coordinator.inline(key),
    update: (patch) => coordinator.update(key, patch),
    adjustItemCount: (delta) => coordinator.adjustItemCount(key, delta),
  }

  return (
    <RootContext.Provider value={state}>
      <Show when={coordinator.active(key)}>{local.children}</Show>
    </RootContext.Provider>
  )
}

export type ComposerActionsButtonProps = {
  visible?: 'auto' | 'always'
  tooltip: string
  onClick: () => void
  busy?: boolean
  class?: string
  variant?: 'ghost' | 'solid'
  children: JSX.Element
}

function Button(props: ComposerActionsButtonProps): JSX.Element {
  const root = useContext(RootContext)
  if (root === undefined) return null
  const [local] = splitProps(props, ['visible', 'tooltip', 'onClick', 'busy', 'class', 'variant', 'children'])
  const pinned = (): boolean => local.visible === 'always'

  root.update(untrack(() => ({hasButton: true, pinned: pinned()})))
  onCleanup(() => root.update({hasButton: false, pinned: false}))
  createEffect(() => root.update({pinned: pinned()}))

  return (
    <Show when={root.inline()}>
      <TooltipIconButton
        tooltip={local.tooltip}
        variant={local.variant}
        class={local.class ?? ACTION_CLASS}
        disabled={root.disabled()}
        aria-busy={local.busy}
        onClick={() => local.onClick()}
      >
        {local.children}
      </TooltipIconButton>
    </Show>
  )
}

export type ComposerActionsInlineProps = {
  children: JSX.Element
}

function Inline(props: ComposerActionsInlineProps): JSX.Element {
  const root = useContext(RootContext)
  if (root === undefined) return null
  const [local] = splitProps(props, ['children'])

  root.update({hasButton: true})
  onCleanup(() => root.update({hasButton: false}))

  return <Show when={root.inline()}>{local.children}</Show>
}

export type ComposerActionsDropdownItemProps = {
  value: string
  label: string
  onSelect: () => void
  children?: JSX.Element
}

function DropdownItem(props: ComposerActionsDropdownItemProps): JSX.Element {
  const root = useContext(RootContext)
  const coordinator = useContext(CoordinatorContext)
  if (root === undefined || coordinator === undefined) return null
  const [local] = splitProps(props, ['value', 'label', 'onSelect', 'children'])

  root.adjustItemCount(1)
  onCleanup(() => root.adjustItemCount(-1))

  return (
    <Show when={!root.inline() && coordinator.active(root.key) && coordinator.groupMount(root.key)}>
      {(mount) => (
        <Portal mount={mount()}>
          <Menu.Item value={`${root.id}:${local.value}`} disabled={root.disabled()} onSelect={() => local.onSelect()}>
            {local.children}
            {local.label}
          </Menu.Item>
        </Portal>
      )}
    </Show>
  )
}

export const ComposerActions = {Root, Button, DropdownItem, Inline}
