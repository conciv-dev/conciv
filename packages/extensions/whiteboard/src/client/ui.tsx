import {For, Show, type JSX} from 'solid-js'
import {Avatar as AvatarBase, Menu as MenuBase, Tabs as TabsBase, Tooltip as TooltipBase} from '@conciv/ui-kit-system'

const AVATAR_RING = '[box-shadow:0_0_0_2px_var(--pw-panel)]'
const AVATAR_FALLBACK = 'text-[0.6875rem] font-semibold uppercase leading-none'

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('') || '?'

export function Avatar(props: {name: string; src?: string; class?: string}): JSX.Element {
  return (
    <AvatarBase.Root class={`${AVATAR_RING}  ${props.class ?? ''}`}>
      <Show when={props.src}>{(src) => <AvatarBase.Image src={src()} alt={props.name} />}</Show>
      <AvatarBase.Fallback class={AVATAR_FALLBACK}>{initials(props.name)}</AvatarBase.Fallback>
    </AvatarBase.Root>
  )
}

export function Tooltip(props: {
  label: string
  children: JSX.Element
  onClick?: () => void
  placement?: 'top' | 'bottom' | 'left' | 'right'
  triggerClass?: string
  class?: string
}): JSX.Element {
  return (
    <TooltipBase.Root positioning={{placement: props.placement ?? 'top', gutter: 6}}>
      <TooltipBase.Trigger
        aria-label={props.label}
        onClick={() => props.onClick?.()}
        class={`inline-flex ${props.triggerClass ?? ''}`}
      >
        {props.children}
      </TooltipBase.Trigger>
      <TooltipBase.Positioner>
        <TooltipBase.Content class={props.class}>{props.label}</TooltipBase.Content>
      </TooltipBase.Positioner>
    </TooltipBase.Root>
  )
}

const MENU_LINE =
  'flex items-center gap-2 px-2 py-1.5 rounded-pw-sm text-[0.8125rem] text-pw-text cursor-pointer outline-none data-[highlighted]:bg-pw-fill'
const MENU_DANGER =
  'text-pw-danger data-[highlighted]:text-pw-danger data-[highlighted]:[background:color-mix(in_oklch,var(--pw-danger)_15%,transparent)]'

const MENU_INDICATOR = 'ml-auto text-pw-accent'

export function Menu(props: {
  trigger: JSX.Element
  children: JSX.Element
  onSelect?: (value: string) => void
  closeOnSelect?: boolean
  label?: string
  class?: string
}): JSX.Element {
  return (
    <MenuBase.Root closeOnSelect={props.closeOnSelect ?? true} onSelect={(detail) => props.onSelect?.(detail.value)}>
      <MenuBase.Trigger class="inline-flex" aria-label={props.label}>
        {props.trigger}
      </MenuBase.Trigger>
      <MenuBase.Positioner>
        <MenuBase.Content class={props.class}>{props.children}</MenuBase.Content>
      </MenuBase.Positioner>
    </MenuBase.Root>
  )
}

export function MenuItem(props: {
  value: string
  children: JSX.Element
  icon?: JSX.Element
  danger?: boolean
}): JSX.Element {
  return (
    <MenuBase.Item value={props.value} class={props.danger ? MENU_DANGER : ''}>
      <Show when={props.icon}>{(icon) => <span class="inline-flex shrink-0">{icon()}</span>}</Show>
      <MenuBase.ItemText>{props.children}</MenuBase.ItemText>
    </MenuBase.Item>
  )
}

export function MenuCheckboxItem(props: {
  value: string
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  children: JSX.Element
}): JSX.Element {
  return (
    <MenuBase.CheckboxItem
      value={props.value}
      checked={props.checked}
      onCheckedChange={(checked) => props.onCheckedChange?.(checked)}
      closeOnSelect={false}
      class={MENU_LINE}
    >
      <MenuBase.ItemText>{props.children}</MenuBase.ItemText>
      <MenuBase.ItemIndicator class={MENU_INDICATOR}>✓</MenuBase.ItemIndicator>
    </MenuBase.CheckboxItem>
  )
}

export function MenuRadioGroup(props: {
  value: string
  onValueChange?: (value: string) => void
  children: JSX.Element
}): JSX.Element {
  return (
    <MenuBase.RadioItemGroup value={props.value} onValueChange={(detail) => props.onValueChange?.(detail.value)}>
      {props.children}
    </MenuBase.RadioItemGroup>
  )
}

export function MenuRadioItem(props: {value: string; children: JSX.Element}): JSX.Element {
  return (
    <MenuBase.RadioItem value={props.value} class={MENU_LINE}>
      <MenuBase.ItemText>{props.children}</MenuBase.ItemText>
      <MenuBase.ItemIndicator class={MENU_INDICATOR}>✓</MenuBase.ItemIndicator>
    </MenuBase.RadioItem>
  )
}

export function MenuSeparator(): JSX.Element {
  return <MenuBase.Separator />
}

export type TabItem = {value: string; trigger: JSX.Element; label: string; content?: JSX.Element}

const TAB_TRIGGER =
  'inline-flex items-center justify-center size-8 rounded-pw-sm text-pw-text-3 [transition:color_120ms_var(--pw-ease),background-color_120ms_var(--pw-ease)] hover:text-pw-text data-[selected]:text-pw-accent data-[selected]:bg-pw-accent-08 focus-ring'

export function Tabs(props: {
  value: string
  onValueChange?: (value: string) => void
  tabs: TabItem[]
  class?: string
}): JSX.Element {
  return (
    <TabsBase.Root
      value={props.value}
      onValueChange={(detail) => props.onValueChange?.(detail.value)}
      class={props.class}
    >
      <TabsBase.List class="inline-flex gap-1 [border:none] items-center">
        <For each={props.tabs}>
          {(tab) => (
            <TabsBase.Trigger value={tab.value} class={TAB_TRIGGER} aria-label={tab.label}>
              {tab.trigger}
            </TabsBase.Trigger>
          )}
        </For>
      </TabsBase.List>
      <For each={props.tabs}>
        {(tab) => (
          <Show when={tab.content}>
            <TabsBase.Content value={tab.value}>{tab.content}</TabsBase.Content>
          </Show>
        )}
      </For>
    </TabsBase.Root>
  )
}
