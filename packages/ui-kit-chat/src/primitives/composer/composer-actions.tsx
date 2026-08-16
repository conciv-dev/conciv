import {
  batch,
  createContext,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  Show,
  splitProps,
  useContext,
  type JSX,
} from 'solid-js'
import {makeResizeObserver} from '@solid-primitives/resize-observer'
import {Menu, TooltipIconButton, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {
  createActionsCoordinator,
  type ActionMenuEntry,
  type ActionsCoordinator,
  type ActionSource,
  type RegisteredAction,
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
  leading?: JSX.Element
  trailing: JSX.Element
  triggerContent: JSX.Element
  maxInlineAuto?: number
  onOverflowDismissed?: () => void
  children: JSX.Element
}

export function ComposerActionsHost(props: ComposerActionsHostProps): JSX.Element {
  const [local] = splitProps(props, [
    'leading',
    'trailing',
    'triggerContent',
    'maxInlineAuto',
    'onOverflowDismissed',
    'children',
  ])
  const coordinator = createActionsCoordinator({
    maxInlineAuto: () => local.maxInlineAuto,
    onOverflowDismissed: () => local.onOverflowDismissed?.(),
  })
  let rowElement: Element | undefined
  let leadingElement: Element | undefined
  let trailingElement: Element | undefined
  const applyEntry = (entry: ResizeObserverEntry): void => {
    if (entry.target === rowElement) coordinator.setRowWidth(entry.contentRect.width)
    if (entry.target === leadingElement) coordinator.setLeadingWidth(entry.contentRect.width)
    if (entry.target === trailingElement) coordinator.setTrailingWidth(entry.contentRect.width)
  }
  const {observe} = makeResizeObserver((entries) => batch(() => entries.forEach(applyEntry)))

  return (
    <CoordinatorContext.Provider value={coordinator}>
      <Menu.Root open={coordinator.menuOpen()} onOpenChange={(details) => coordinator.setMenuOpen(details.open)}>
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
            {local.leading}
          </div>
          {local.children}
          <Show
            when={coordinator.anyCollapsed()}
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
          <div
            ref={(element) => {
              trailingElement = element
              observe(element)
            }}
            class={`ml-auto ${REGION_CLASS}`}
          >
            {local.trailing}
          </div>
        </div>
        <Menu.Positioner>
          <Menu.Content aria-label={TRIGGER_TOOLTIP}>
            <For each={coordinator.menuActions()}>{(action) => <OverflowGroup action={action} />}</For>
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>
    </CoordinatorContext.Provider>
  )
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
  const [inlineClaimed, setInlineClaimed] = createSignal(false)
  const [menuEntries, setMenuEntries] = createSignal<ActionMenuEntry[]>([])
  const disabled = (): boolean => local.disabled?.() === true
  const key = coordinator.register({
    priority: () => local.priority ?? 0,
    pinned: () => local.visible === 'always',
    disabled,
    inlineContent: inlineClaimed,
    menuContent: menuEntries,
  })
  const pairing: ActionPairing = {
    disabled,
    inline: () => coordinator.isInline(key),
    claimInline: () => {
      setInlineClaimed(true)
      onCleanup(() => setInlineClaimed(false))
    },
    registerMenuEntry: (entry) => {
      setMenuEntries((current) => [...current, entry])
      onCleanup(() => setMenuEntries((current) => current.filter((existing) => existing.key !== entry.key)))
    },
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

export const ComposerActions = {Action, ActionButton, ActionMenuItem, Inline}
