import {
  batch,
  createContext,
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
import {makeResizeObserver} from '@solid-primitives/resize-observer'
import {Menu, TooltipIconButton, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {
  createActionsCoordinator,
  type ActionMenuEntry,
  type ActionsCoordinator,
  type ActionSource,
  type RegionWidths,
  type RegisteredAction,
  type SlotName,
} from './composer-actions-core.js'

type ActionPairing = {
  disabled: () => boolean
  inline: () => boolean
  claimInline: () => void
  registerMenuEntry: (entry: ActionMenuEntry) => void
}

const TRIGGER_TOOLTIP = 'More composer actions'
const TRIGGER_CLASS = 'size-8.5'
const ACTION_CLASS = 'size-8.5'
const REGION_CLASS = 'empty:hidden flex gap-1 items-center'

const NO_MENU_CONTENT: ActionMenuEntry[] = []

const CoordinatorContext = createContext<ActionsCoordinator>()
const PairingContext = createContext<ActionPairing>()

function usePlacement(source: ActionSource): () => boolean {
  const pairing = useContext(PairingContext)
  const coordinator = useContext(CoordinatorContext)
  if (pairing !== undefined) {
    pairing.claimInline()
    return pairing.inline
  }
  if (coordinator === undefined) return () => false
  const key = coordinator.register(source)
  return () => coordinator.isInline(key)
}

export type ComposerActionsHostProps = {
  maxInlineAuto?: number
  onOverflowDismissed?: () => void
  children: JSX.Element
}

export function ComposerActionsHost(props: ComposerActionsHostProps): JSX.Element {
  const [local] = splitProps(props, ['maxInlineAuto', 'onOverflowDismissed', 'children'])
  const [widths, setWidths] = createStore<RegionWidths>({row: 0, leading: 0, trailing: 0})
  let rowElement: Element | undefined
  let leadingElement: Element | undefined
  let trailingElement: Element | undefined
  const applyEntry = (entry: ResizeObserverEntry): void => {
    if (entry.target === rowElement) setWidths('row', entry.contentRect.width)
    if (entry.target === leadingElement) setWidths('leading', entry.contentRect.width)
    if (entry.target === trailingElement) setWidths('trailing', entry.contentRect.width)
  }
  const {observe} = makeResizeObserver((entries) => batch(() => entries.forEach(applyEntry)))
  const coordinator = createActionsCoordinator({widths, maxInlineAuto: () => local.maxInlineAuto})

  return (
    <CoordinatorContext.Provider value={coordinator}>
      <div
        ref={(element) => {
          rowElement = element
          observe(element)
        }}
        class="pt-0.5 flex gap-1 items-center"
      >
        <div
          ref={(element) => {
            leadingElement = element
            observe(element)
          }}
          class={REGION_CLASS}
        >
          {coordinator.slotRender('leading')?.()}
        </div>
        {local.children}
        <Show
          when={coordinator.anyCollapsed()}
          fallback={<span aria-hidden="true" class={`${ACTION_CLASS} shrink-0 invisible`} />}
        >
          <Menu.Root>
            <TooltipIconButtonSlot tooltip={TRIGGER_TOOLTIP} class={TRIGGER_CLASS}>
              {(buttonProps) => (
                <Menu.Trigger
                  asChild={(triggerProps) => (
                    <button {...buttonProps()} {...triggerProps()}>
                      {coordinator.slotRender('trigger')?.()}
                    </button>
                  )}
                />
              )}
            </TooltipIconButtonSlot>
            <Menu.Positioner>
              <Menu.Content aria-label={TRIGGER_TOOLTIP}>
                <For each={coordinator.menuActions()}>{(action) => <OverflowGroup action={action} />}</For>
              </Menu.Content>
            </Menu.Positioner>
            <Menu.Context>
              {(api) => (
                <Show when={api().open}>
                  <OverflowDismissal
                    collapsed={coordinator.anyCollapsed}
                    onDismissed={() => local.onOverflowDismissed?.()}
                  />
                </Show>
              )}
            </Menu.Context>
          </Menu.Root>
        </Show>
        <div
          ref={(element) => {
            trailingElement = element
            observe(element)
          }}
          class={`ml-auto ${REGION_CLASS}`}
        >
          {coordinator.slotRender('trailing')?.()}
        </div>
      </div>
    </CoordinatorContext.Provider>
  )
}

function OverflowDismissal(props: {collapsed: () => boolean; onDismissed: () => void}): JSX.Element {
  const [local] = splitProps(props, ['collapsed', 'onDismissed'])
  onCleanup(() => {
    if (untrack(local.collapsed)) return
    local.onDismissed()
  })
  return null
}

function OverflowGroup(props: {action: RegisteredAction}): JSX.Element {
  const [local] = splitProps(props, ['action'])
  return (
    <For each={local.action.menuContent()}>
      {(entry) => (
        <Menu.Item value={entry.key} disabled={local.action.disabled()} onSelect={() => entry.onSelect()}>
          {entry.icon()}
          {entry.label()}
        </Menu.Item>
      )}
    </For>
  )
}

export type ComposerActionsSlotProps = {children: JSX.Element}

function createSlot(slot: SlotName) {
  return function ComposerActionsSlot(props: ComposerActionsSlotProps): JSX.Element {
    const coordinator = useContext(CoordinatorContext)
    if (coordinator === undefined) return null
    const [local] = splitProps(props, ['children'])
    coordinator.registerSlot({slot, render: () => local.children})
    return null
  }
}

const Leading = createSlot('leading')
const Trailing = createSlot('trailing')
const Trigger = createSlot('trigger')

export type ComposerActionsActionProps = {
  priority?: number
  visible?: 'auto' | 'always'
  disabled?: () => boolean
  children: JSX.Element
}

function Action(props: ComposerActionsActionProps): JSX.Element {
  const coordinator = useContext(CoordinatorContext)
  if (coordinator === undefined) return null
  const [local] = splitProps(props, ['priority', 'visible', 'disabled', 'children'])
  const disabled = (): boolean => local.disabled?.() === true
  const paired = coordinator.registerPaired({
    priority: () => local.priority ?? 0,
    pinned: () => local.visible === 'always',
    disabled,
  })
  const pairing: ActionPairing = {
    disabled,
    inline: paired.isInline,
    claimInline: paired.claimInline,
    registerMenuEntry: paired.registerMenuEntry,
  }
  return <PairingContext.Provider value={pairing}>{local.children}</PairingContext.Provider>
}

export type ComposerActionsActionButtonProps = {
  priority?: number
  visible?: 'auto' | 'always'
  tooltip: string
  onClick: () => void
  disabled?: () => boolean
  busy?: boolean
  class?: string
  variant?: 'ghost' | 'solid'
  children: JSX.Element
}

function ActionButton(props: ComposerActionsActionButtonProps): JSX.Element {
  const [local] = splitProps(props, [
    'priority',
    'visible',
    'tooltip',
    'onClick',
    'disabled',
    'busy',
    'class',
    'variant',
    'children',
  ])
  const pairing = useContext(PairingContext)
  const disabled = (): boolean => pairing?.disabled() === true || local.disabled?.() === true
  const entries: ActionMenuEntry[] = [
    {key: createUniqueId(), label: () => local.tooltip, icon: () => local.children, onSelect: () => local.onClick()},
  ]
  const inline = usePlacement({
    priority: () => local.priority ?? 0,
    pinned: () => local.visible === 'always',
    disabled,
    inlineContent: () => true,
    menuContent: () => entries,
  })
  return (
    <Show when={inline()}>
      <TooltipIconButton
        tooltip={local.tooltip}
        variant={local.variant}
        class={local.class ?? ACTION_CLASS}
        disabled={disabled()}
        aria-busy={local.busy}
        onClick={() => local.onClick()}
      >
        {local.children}
      </TooltipIconButton>
    </Show>
  )
}

export type ComposerActionsActionMenuItemProps = {
  label: string
  onSelect: () => void
  children?: JSX.Element
}

function ActionMenuItem(props: ComposerActionsActionMenuItemProps): JSX.Element {
  const pairing = useContext(PairingContext)
  if (pairing === undefined) return null
  const [local] = splitProps(props, ['label', 'onSelect', 'children'])
  pairing.registerMenuEntry({
    key: createUniqueId(),
    label: () => local.label,
    icon: () => local.children,
    onSelect: () => local.onSelect(),
  })
  return null
}

export type ComposerActionsInlineProps = {
  priority?: number
  visible?: 'auto' | 'always'
  children: JSX.Element
}

function Inline(props: ComposerActionsInlineProps): JSX.Element {
  const [local] = splitProps(props, ['priority', 'visible', 'children'])
  const inline = usePlacement({
    priority: () => local.priority ?? 0,
    pinned: () => local.visible === 'always',
    disabled: () => false,
    inlineContent: () => true,
    menuContent: () => NO_MENU_CONTENT,
  })
  return <Show when={inline()}>{local.children}</Show>
}

export const ComposerActions = {Action, ActionButton, ActionMenuItem, Inline, Leading, Trailing, Trigger}
