import {children, createUniqueId, For, onCleanup, Show, splitProps, type JSX} from 'solid-js'
import {
  type Ui,
  type UiIconProps,
  type UiMenuCheckbox,
  type UiMenuItem,
  type UiMenuRadioGroup,
  type UiMenuSubProps,
} from '@conciv/plugin/experimental'
import {OpaqueUi, type InternalStatusDotProps} from '@internal/plugin'
import {
  HarnessModelSelector,
  Icon as KitIcon,
  Markdown,
  MorphLabel,
  ReasoningText,
  useModelMenu,
} from '@conciv/ui-kit-chat'
import {
  BasicTool,
  CARD_HEADLINE_TEXT,
  CardHeadline,
  Chip,
  ChipRow,
  clip,
  CodeBlock,
  CollapsibleSection,
  DANGER_TEXT_CLASS,
  displayValue,
  ErrorBlock,
  GENERIC_TOOL_ICON,
  JsonTree,
  parseInput,
  parseResultPayload,
  ResultImage,
  resultText,
  SHIMMER,
  StatusVisual,
  SUNKEN_SURFACE,
  ToolCard,
  ToolErrorCard,
} from '@conciv/ui-kit-chat/tools'
import {MentionField} from '@conciv/ui-kit-tap'
import {isPlainObject} from 'es-toolkit'
import {
  Avatar,
  Button,
  ClipboardCopyButton,
  Collapsible,
  createListCollection,
  Dialog,
  Kbd,
  LIST_PANEL_ITEM,
  prefersReducedMotion,
  Loader,
  Menu,
  Popover,
  RelativeTime,
  Select,
  StatusDot,
  Switch,
  TextField,
  Tooltip,
  TruncatedText,
  type ButtonSize,
  type StatusDotTone,
  type ButtonVariant,
  type LoaderSize,
} from '@conciv/ui-kit-system'
import {ActionRow, Group, SettingsHeader} from '../../settings/settings-ui'
import {useLayers} from '../../app/context'

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

const buttonSize: Record<'small' | 'normal' | 'large', ButtonSize> = {small: 'sm', normal: 'md', large: 'lg'}

const iconButtonSize: Record<'small' | 'normal' | 'large', ButtonSize> = {
  small: 'icon-sm',
  normal: 'icon',
  large: 'icon-lg',
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

const COLLAPSIBLE_TRIGGER =
  'text-[12px] text-chat-text-3 w-fit cursor-pointer focus-ring trans-color-bg hover:text-chat-text-2'

const subtitleTone = {default: '', muted: 'text-chat-text-3', warning: 'text-chat-warn', danger: 'text-chat-danger'}

const stillDot: Record<InternalStatusDotProps['tone'], StatusDotTone | undefined> = {
  neutral: 'idle',
  success: 'success',
  warning: 'warn',
  danger: 'danger',
  running: undefined,
}

const publicUi: Ui = {
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
      size={iconButtonSize[props.size ?? 'normal']}
      disabled={props.disabled || props.busy}
      aria-label={props.label}
      aria-pressed={props.pressed}
      aria-busy={props.busy || undefined}
      class={`${buttonVariant[props.variant ?? 'ghost-muted'].class} ${ICON_BUTTON_PRESSED} ${props.class ?? ''}`}
      onClick={(event: MouseEvent) => props.onClick?.(event)}
    >
      <Show when={props.busy} fallback={<Icon name={props.icon} />}>
        <Busy />
      </Show>
    </Button>
  ),
  Tooltip: (props) => (
    <span class="contents">
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
    </span>
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

              if (entry.type === 'radio-group') return <MenuRadioGroup {...entry} />

              if (entry.type === 'checkbox') return <MenuCheckbox {...entry} />

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
  Popover: (props) => (
    <Popover.Root
      open={props.open}
      onOpenChange={(details) => props.onOpenChange(details.open)}
      modal={false}
      portalled={false}
      positioning={{
        placement: 'right-start',
        flip: ['left-start', 'bottom-start', 'top-start'],
        gutter: 8,
        getAnchorElement: () => props.anchor() ?? null,
      }}
      persistentElements={[() => props.anchor() ?? null]}
      initialFocusEl={() => props.initialFocus?.() ?? null}
      finalFocusEl={() => props.anchor() ?? null}
    >
      <Show when={props.open}>
        <OpenLayer />
      </Show>
      <Popover.Positioner>
        <Popover.Content aria-label={props.label} class="p-4">
          {props.children}
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  ),
  RelativeTime: (props) => <RelativeTime value={props.value} />,
  Avatar: (props) => (
    <Avatar.Root role="img" aria-label={props.name}>
      <Show when={props.src}>{(src) => <Avatar.Image src={src()} alt={props.name} />}</Show>
      <Avatar.Fallback>{initials(props.name)}</Avatar.Fallback>
    </Avatar.Root>
  ),
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
      size={props.size === 'large' ? 'lg' : 'md'}
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
  Chip: (props) => (
    <Chip
      kind="pill"
      value={props.value}
      tone={props.tone}
      tooltip={props.tooltip}
      compact={props.compact}
      class={props.class}
    />
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

export const ui = OpaqueUi.createInstance('v1', {
  ...publicUi,
  BasicTool: (props) => {
    const [local, tool] = splitProps(props, [
      'title',
      'subtitle',
      'subtitleTone',
      'failed',
      'expandable',
      'openWhileRunning',
      'args',
      'children',
    ])

    return (
      <BasicTool
        {...tool}
        status={local.failed ? 'error' : tool.status}
        trigger={{
          title: local.title,
          subtitle: local.subtitle,
          subtitleClass: subtitleTone[local.subtitleTone ?? 'default'],
          args: local.args,
        }}
        hasContent={local.expandable ?? false}
        allowOpenWhilePending={local.openWhileRunning}
      >
        {local.children}
      </BasicTool>
    )
  },
  ErrorMessage: ErrorBlock,
  TruncatedText,
  StatusDot: (props) => (
    <Show when={stillDot[props.tone]} fallback={<StatusVisual status="running" form="dot" />}>
      {(tone) => <StatusDot tone={tone()} />}
    </Show>
  ),
  Json: (props) => (
    <Show
      when={treeable(props.value)}
      fallback={
        <CodeBlock
          size="xs"
          file={{name: 'value.json', lang: 'json', contents: JSON.stringify(props.value, null, 2) ?? 'undefined'}}
        />
      }
    >
      {(value) => <JsonTree data={value()} />}
    </Show>
  ),
  Image: ResultImage,
  MentionField,
  HarnessModelSelector,
  useModelMenu,
  CopyButton: (props) => (
    <ClipboardCopyButton text={props.text} tooltips={{idle: props.label}} onCopied={() => props.onCopied?.()} />
  ),
  Collapsible: (props) => (
    <Collapsible.Root defaultOpen={props.defaultOpen}>
      <Collapsible.Trigger class={COLLAPSIBLE_TRIGGER}>{props.trigger}</Collapsible.Trigger>
      <Collapsible.Content>{props.children}</Collapsible.Content>
    </Collapsible.Root>
  ),
  ToolCard,
  CardHeadline,
  CodeBlock,
  CollapsibleSection,
  StatusVisual,
  JsonTree,
  ToolErrorCard,
  ChipRow,
  MorphLabel,
  ReasoningText,
  Kbd,
  KitChip: Chip,
  KitButton: Button,
  KitDialog: Dialog,
  KitLoader: Loader,
  clip,
  displayValue,
  parseInput,
  resultText,
  parseResultPayload,
  prefersReducedMotion,
  CARD_HEADLINE_TEXT,
  SHIMMER,
  SUNKEN_SURFACE,
  DANGER_TEXT_CLASS,
  GENERIC_TOOL_ICON,
})

function treeable(value: unknown): object | undefined {
  return Array.isArray(value) || isPlainObject(value) ? value : undefined
}

function Icon(props: UiIconProps): JSX.Element {
  return <KitIcon name={props.name} size={props.size} class={`shrink-0 ${props.class ?? ''}`} />
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

function OpenLayer(): JSX.Element {
  onCleanup(useLayers().register(() => true, false))

  return null
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
    <Menu.Item value={value} valueText={props.label} disabled={props.disabled} onSelect={() => props.onSelect()}>
      <Show when={props.icon}>{(icon) => <Icon name={icon()} size="small" class={MUTED_ICON} />}</Show>
      <span class="min-w-0 truncate">{props.label}</span>
      <Show when={props.keys?.length}>
        <Keys keys={props.keys ?? []} class="ms-auto" />
      </Show>
    </Menu.Item>
  )
}

function MenuRadioGroup(props: UiMenuRadioGroup): JSX.Element {
  const scope = `${createUniqueId()}:`
  const scoped = (value: string) => `${scope}${value}`

  return (
    <Menu.RadioItemGroup
      value={scoped(props.value)}
      onValueChange={(details) => props.onValueChange(details.value.slice(scope.length))}
    >
      <Show when={props.label}>{(label) => <Menu.ItemGroupLabel>{label()}</Menu.ItemGroupLabel>}</Show>
      <For each={props.items}>
        {(item) => (
          <Menu.RadioItem value={scoped(item.value)} valueText={item.label} disabled={item.disabled} class={MENU_ITEM}>
            <MenuItemCheck />
            <Menu.ItemText class="min-w-0 truncate">{item.label}</Menu.ItemText>
          </Menu.RadioItem>
        )}
      </For>
    </Menu.RadioItemGroup>
  )
}

function MenuCheckbox(props: UiMenuCheckbox): JSX.Element {
  const value = createUniqueId()

  return (
    <Menu.CheckboxItem
      value={value}
      valueText={props.label}
      checked={props.checked}
      disabled={props.disabled}
      onCheckedChange={(checked) => props.onCheckedChange(checked)}
      class={MENU_ITEM}
    >
      <MenuItemCheck />
      <Menu.ItemText class="min-w-0 truncate">{props.label}</Menu.ItemText>
    </Menu.CheckboxItem>
  )
}

function MenuItemCheck(): JSX.Element {
  return (
    <span class="flex size-4 shrink-0 items-center justify-center">
      <Menu.ItemIndicator>
        <Icon name="check" size="small" />
      </Menu.ItemIndicator>
    </span>
  )
}

function SubTriggerBody(props: Pick<UiMenuSubProps, 'icon' | 'label'>): JSX.Element {
  return (
    <>
      <Show when={props.icon}>{(icon) => <Icon name={icon()} size="small" class={MUTED_ICON} />}</Show>
      <span class="min-w-0 truncate">{props.label}</span>
      <Icon name="chevron-right" size="small" class={`ms-auto ${MUTED_ICON}`} />
    </>
  )
}

function fence(content: string, language: string | undefined) {
  const longest = Array.from(content.matchAll(/`+/g)).reduce((most, run) => Math.max(most, run[0].length), 0)
  const ticks = '`'.repeat(Math.max(3, longest + 1))
  const info = (language ?? '').replace(/[^\w#+.-]/g, '')

  return `${ticks}${info}\n${content.endsWith('\n') ? content : `${content}\n`}${ticks}`
}
