import {children, createUniqueId, For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {Ui, UiIconProps, UiMenuItem, UiMenuSubProps} from '@conciv/plugin/experimental'
import {Markdown} from '@conciv/ui-kit-chat'
import {
  Button,
  createListCollection,
  Dialog,
  Kbd,
  LIST_PANEL_ITEM,
  Loader,
  Menu,
  Select,
  Switch,
  TextField,
  Tooltip,
  type ButtonSize,
  type ButtonVariant,
  type LoaderSize,
} from '@conciv/ui-kit-system'
import {ActionRow, Group, SettingsHeader} from '../../settings/settings-ui'
import {icons} from './icons'

const iconSize = {small: 'size-3.5', normal: 'size-4', large: 'size-5'}

const loaderSize: Record<'small' | 'normal' | 'large', LoaderSize> = {small: 'sm', normal: 'md', large: 'lg'}

const buttonVariant: Record<
  'neutral' | 'contrast' | 'ghost' | 'ghost-muted' | 'danger',
  {variant: ButtonVariant; class: string}
> = {
  neutral: {variant: 'outline', class: ''},
  contrast: {variant: 'solid', class: ''},
  ghost: {variant: 'plain', class: 'text-chat-text hover:bg-chat-fill-strong'},
  'ghost-muted': {variant: 'ghost', class: ''},
  danger: {variant: 'danger', class: ''},
}

const buttonSize: Record<'small' | 'normal' | 'large', ButtonSize> = {small: 'sm', normal: 'md', large: 'md'}

const ICON_BUTTON_FRAME = 'font-chat focus-ring rounded-chat-surface-md'

const iconButtonSize: Record<'small' | 'normal' | 'large', {size: ButtonSize; class: string}> = {
  small: {size: 'none', class: `${ICON_BUTTON_FRAME} size-8`},
  normal: {size: 'icon', class: ''},
  large: {size: 'none', class: `${ICON_BUTTON_FRAME} size-11`},
}

const ICON_BUTTON_PRESSED = 'aria-pressed:bg-chat-fill-strong aria-pressed:text-chat-text'

const dialogSize: Record<'fit' | 'normal' | 'large' | 'x-large', 'md' | 'lg' | 'xl'> = {
  fit: 'md',
  normal: 'md',
  large: 'lg',
  'x-large': 'xl',
}

const MENU_ITEM = `${LIST_PANEL_ITEM} data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`

const MUTED_ICON = 'shrink-0 text-chat-text-3'

const MENU_CONTENT = 'w-max max-w-[calc(100vw-2rem)]'

export const ui: Ui = {
  Icon,
  Button: (props) => (
    <Button
      type={props.type ?? 'button'}
      variant={buttonVariant[props.variant ?? 'neutral'].variant}
      size={buttonSize[props.size ?? 'normal']}
      disabled={props.disabled || props.busy}
      aria-busy={props.busy || undefined}
      autofocus={props.autofocus}
      class={`${buttonVariant[props.variant ?? 'neutral'].class} ${props.class ?? ''}`}
      onClick={(event: MouseEvent) => props.onClick?.(event)}
    >
      <Show
        when={props.busy}
        fallback={
          <Show when={props.icon}>
            {(icon) => <Icon name={icon()} size={props.size === 'small' ? 'small' : 'normal'} />}
          </Show>
        }
      >
        <Busy />
      </Show>
      {props.children}
    </Button>
  ),
  IconButton: (props) => (
    <Button
      type="button"
      variant={buttonVariant[props.variant ?? 'ghost-muted'].variant}
      size={iconButtonSize[props.size ?? 'normal'].size}
      disabled={props.disabled || props.busy}
      aria-label={props.label}
      aria-pressed={props.pressed}
      aria-busy={props.busy || undefined}
      class={`${buttonVariant[props.variant ?? 'ghost-muted'].class} ${iconButtonSize[props.size ?? 'normal'].class} ${ICON_BUTTON_PRESSED} ${props.class ?? ''}`}
      onClick={(event: MouseEvent) => props.onClick?.(event)}
    >
      <Show when={props.busy} fallback={<Icon name={props.icon} />}>
        <Busy />
      </Show>
    </Button>
  ),
  Tooltip: (props) => (
    <Tooltip.Root positioning={{placement: props.placement ?? 'top'}}>
      <Tooltip.Trigger asChild={(triggerProps) => <span {...triggerProps()}>{props.children}</span>} />
      <Tooltip.Positioner>
        <Tooltip.Content>
          <span class="flex items-center gap-2">
            <span>{props.value}</span>
            <Show when={props.keys?.length}>
              <Keys keys={props.keys ?? []} />
            </Show>
          </span>
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  ),
  Menu: (props) => (
    <Menu.Root positioning={{placement: props.placement ?? 'bottom-end', gutter: 4}}>
      <Show
        when={props.trigger === 'button'}
        fallback={
          <Menu.Trigger
            asChild={(triggerProps) => (
              <Button
                {...triggerProps()}
                variant={buttonVariant['ghost-muted'].variant}
                size="icon"
                disabled={props.disabled}
                aria-label={props.label}
              >
                <Icon name={props.icon ?? 'ellipsis'} />
              </Button>
            )}
          />
        }
      >
        <Menu.Trigger
          asChild={(triggerProps) => (
            <Button {...triggerProps()} variant="outline" size="md" disabled={props.disabled}>
              <Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>
              {props.label}
            </Button>
          )}
        />
      </Show>
      <Menu.Positioner>
        <Menu.Content class={MENU_CONTENT}>
          <For each={props.items}>
            {(entry) => {
              if (entry.type === 'separator') return <Menu.Separator />

              if (entry.type === 'group')
                return (
                  <Menu.ItemGroup>
                    <Menu.ItemGroupLabel>{entry.label}</Menu.ItemGroupLabel>
                    <For each={entry.items}>{(item) => <MenuItem {...item} />}</For>
                  </Menu.ItemGroup>
                )

              return <MenuItem {...entry} />
            }}
          </For>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  ),
  MenuItem,
  MenuSeparator: () => <Menu.Separator />,
  MenuGroup: (props) => (
    <Menu.ItemGroup>
      <Menu.ItemGroupLabel>{props.label}</Menu.ItemGroupLabel>
      {props.children}
    </Menu.ItemGroup>
  ),
  MenuSub: (props) => (
    <Show
      when={!props.disabled}
      fallback={
        <Menu.Item value={createUniqueId()} disabled>
          <SubTriggerBody icon={props.icon} label={props.label} />
        </Menu.Item>
      }
    >
      <Menu.Root
        positioning={{placement: 'right-start', gutter: 4, overflowPadding: 16, overlap: true}}
        onOpenChange={(details) => props.onOpenChange?.(details.open)}
      >
        <Menu.TriggerItem class={MENU_ITEM}>
          <SubTriggerBody icon={props.icon} label={props.label} />
        </Menu.TriggerItem>
        <Menu.Positioner>
          <Menu.Content class={MENU_CONTENT} aria-label={props.label}>
            {props.children}
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>
    </Show>
  ),
  Loader: (props) => (
    <Loader.Root size={loaderSize[props.size ?? 'normal']} bare class={props.class}>
      <Loader.Indicator class={iconSize[props.size ?? 'normal']} />
    </Loader.Root>
  ),
  Dialog: (props) => {
    const footer = children(() => props.footer)

    return (
      <Dialog.Content size={dialogSize[props.size ?? 'fit']}>
        <Dialog.Header>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <Dialog.Title>{props.title}</Dialog.Title>
            <Show when={props.description}>
              <Dialog.Description class="m-0 text-chat-xs text-chat-text-2">{props.description}</Dialog.Description>
            </Show>
          </div>
          <Show when={props.closable !== false}>
            <Dialog.CloseTrigger />
          </Show>
        </Dialog.Header>
        <Dialog.Body>{props.children}</Dialog.Body>
        <Show when={footer()}>
          <Dialog.Footer>{footer()}</Dialog.Footer>
        </Show>
      </Dialog.Content>
    )
  },
  Switch: (props) => (
    <Switch.Root
      checked={props.checked}
      onCheckedChange={(details) => props.onChange(details.checked)}
      disabled={props.disabled}
    >
      <span class="flex min-w-0 flex-col gap-0.5">
        <Switch.Label class={props.hideLabel ? 'sr-only' : ''}>{props.label}</Switch.Label>
        <Show when={props.description}>
          <span class="text-chat-xs text-chat-text-3">{props.description}</span>
        </Show>
      </span>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.HiddenInput />
    </Switch.Root>
  ),
  TextInput: (props) => (
    <TextField
      type={props.type ?? 'text'}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.label}
      disabled={props.disabled}
      aria-invalid={props.invalid || undefined}
      autofocus={props.autofocus}
      class={props.class}
      onInput={(event) => props.onInput(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.isComposing || !props.onSubmit) return
        event.preventDefault()
        props.onSubmit(event.currentTarget.value)
      }}
    />
  ),
  Select: (props) => (
    <Select.Root
      collection={createListCollection({items: [...props.options]})}
      value={props.value === undefined ? [] : [props.value]}
      disabled={props.disabled}
      invalid={props.invalid}
      positioning={{placement: props.placement ?? 'bottom-end', gutter: 6}}
      class={props.class}
      onValueChange={(details) => {
        const option = details.items.at(0)
        if (option) props.onChange(option.value)
      }}
    >
      <Select.Control>
        <Select.Trigger aria-label={props.label}>
          <Select.ValueText placeholder={props.placeholder} />
          <Select.Indicator>
            <Icon name="chevron-down" size="small" class={MUTED_ICON} />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          <For each={props.options}>
            {(option) => (
              <Select.Item item={option}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Icon name="check" size="small" />
                </Select.ItemIndicator>
              </Select.Item>
            )}
          </For>
        </Select.Content>
      </Select.Positioner>
      <Select.HiddenSelect />
    </Select.Root>
  ),
  Keybind: (props) => (
    <Show when={props.keys.length > 0}>
      <Keys keys={props.keys} class={props.class} />
    </Show>
  ),
  Markdown: (props) => (
    <div class={props.class}>
      <Markdown content={props.text} />
    </div>
  ),
  Code: (props) => (
    <div class={props.class}>
      <Markdown content={fence(props.content, props.language)} />
    </div>
  ),
  SettingsLayout: (props) => (
    <>
      <SettingsHeader title={props.title} description={props.description} actions={props.actions} />
      <div class="flex flex-col gap-3.5">{props.children}</div>
    </>
  ),
  SettingsSection: (props) => (
    <Group title={props.title} footer={props.footer}>
      {props.children}
    </Group>
  ),
  SettingsRow: (props) => (
    <ActionRow id={props.id} label={props.title} hint={props.description}>
      {props.children}
    </ActionRow>
  ),
}

function Icon(props: UiIconProps): JSX.Element {
  return (
    <Dynamic
      component={icons[props.name]}
      class={`shrink-0 ${iconSize[props.size ?? 'normal']} ${props.class ?? ''}`}
      aria-hidden="true"
    />
  )
}

function Busy(): JSX.Element {
  return (
    <Loader.Root size="sm" bare>
      <Loader.Indicator class={iconSize.small} />
    </Loader.Root>
  )
}

function Keys(props: {keys: readonly string[]; class?: string}): JSX.Element {
  return (
    <span class={`inline-flex items-center gap-1 ${props.class ?? ''}`}>
      <For each={props.keys}>{(key) => <Kbd>{key}</Kbd>}</For>
    </span>
  )
}

function MenuItem(props: UiMenuItem) {
  const value = createUniqueId()

  return (
    <Menu.Item value={value} disabled={props.disabled} onSelect={() => props.onSelect()}>
      <Show when={props.icon}>{(icon) => <Icon name={icon()} class={MUTED_ICON} />}</Show>
      <span class="min-w-0 truncate">{props.label}</span>
      <Show when={props.keys?.length}>
        <Keys keys={props.keys ?? []} class="ms-auto" />
      </Show>
    </Menu.Item>
  )
}

function SubTriggerBody(props: Pick<UiMenuSubProps, 'icon' | 'label'>): JSX.Element {
  return (
    <>
      <Show when={props.icon}>{(icon) => <Icon name={icon()} class={MUTED_ICON} />}</Show>
      <span class="min-w-0 truncate">{props.label}</span>
      <Icon name="chevron-right" class={`ms-auto ${MUTED_ICON}`} />
    </>
  )
}

function fence(content: string, language: string | undefined) {
  const longest = Array.from(content.matchAll(/`+/g)).reduce((most, run) => Math.max(most, run[0].length), 0)
  const ticks = '`'.repeat(Math.max(3, longest + 1))
  const info = (language ?? '').replace(/[^\w#+.-]/g, '')

  return `${ticks}${info}\n${content.endsWith('\n') ? content : `${content}\n`}${ticks}`
}
