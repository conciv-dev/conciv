import {createMemo, For, Match, Show, Switch, untrack, type JSX} from 'solid-js'
import {
  ComposerPill,
  type ComposerPillMenuProps,
  type ComposerPillProps,
  type ComposerPillTone,
  type ComposerPillView,
  type IconName,
} from '@conciv/plugin/experimental'
import {Button, LIST_PANEL_GROUP_LABEL, Menu, Popover, usePopover} from '@conciv/ui-kit-system'
import {Icon} from '@conciv/ui-kit-chat'
import {usePluginHost} from '../runtime/plugin/host'
import {Contribution} from '../runtime/plugin/render'
import {Badge} from '../settings/settings-ui'

const TONE: Record<ComposerPillTone, string> = {
  success: 'text-chat-success',
  warning: 'text-chat-warn',
  danger: 'text-chat-danger',
}

const SLOT = 'inline-flex items-center min-w-0 max-w-full'

const PILL =
  'relative min-w-0 max-w-full gap-1 min-h-6 px-2 rounded-chat-pill font-chat-mono text-chat-xs aria-expanded:bg-chat-fill-strong focus-ring after:content-[""] after:absolute after:-inset-y-2.5 after:inset-x-0'

const PANEL = 'w-80 max-w-[calc(100vw-2rem)] p-1 font-chat text-chat-sm'

const PANEL_BODY = 'flex flex-col items-start gap-2 px-2.5 pb-2 min-w-0 max-h-80 overflow-y-auto overscroll-contain'

const MENU = 'w-max max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto overscroll-contain'

const HEADING = `${LIST_PANEL_GROUP_LABEL} block shrink-0 line-clamp-3 [overflow-wrap:anywhere]`

const PLACEMENT = {placement: 'top-start'} as const

export function PluginComposerPills(props: {input: ComposerPillProps}): JSX.Element {
  const host = usePluginHost()

  const items = createMemo(() =>
    host.items(ComposerPill).toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0)),
  )

  return (
    <For each={items()}>
      {(item) => (
        <Contribution plugin={item.plugin}>
          {() => <PluginPill plugin={item.plugin} pill={item.value} input={props.input} />}
        </Contribution>
      )}
    </For>
  )
}

function PluginPill(props: {plugin: string; pill: ComposerPill; input: ComposerPillProps}): JSX.Element {
  const view = createMemo(() => props.pill.show(props.input))

  const run = (action: () => void) =>
    void Promise.try(action).catch((cause: unknown) => console.error(`[plugin] ${props.plugin}`, cause))

  return (
    <Show when={view()}>
      {(current) => (
        <span class={SLOT}>
          <Switch
            fallback={
              <Button
                variant="outline"
                size="none"
                class={PILL}
                aria-label={current().title}
                onClick={() => run(() => current().run?.())}
              >
                <PillContent view={current()} />
              </Button>
            }
          >
            <Match when={props.pill.menu}>
              {(menu) => <MenuPill view={current()} menu={menu()} input={props.input} />}
            </Match>
            <Match when={current().rows}>
              {(rows) => (
                <Menu.Root lazyMount unmountOnExit positioning={PLACEMENT}>
                  <Menu.Trigger
                    asChild={(triggerProps) => (
                      <Button
                        {...triggerProps()}
                        variant="outline"
                        size="none"
                        class={PILL}
                        aria-label={current().title}
                      >
                        <PillContent view={current()} />
                      </Button>
                    )}
                  />
                  <Menu.Positioner>
                    <Menu.Content class={MENU} aria-label={current().title ?? current().label}>
                      <Menu.ItemGroup>
                        <Menu.ItemGroupLabel class="block line-clamp-3 max-w-80 [overflow-wrap:anywhere]">
                          <span dir="auto">{current().title ?? current().label}</span>
                        </Menu.ItemGroupLabel>
                        <For each={rows()}>
                          {(row, index) => (
                            <Menu.Item
                              value={String(index())}
                              disabled={!row.run}
                              onSelect={() => run(() => row.run?.())}
                            >
                              <PillIcon name={row.icon} tone={row.tone} />
                              <span dir="auto" class="min-w-0 flex-1 truncate">
                                {row.label}
                              </span>
                              <Show when={row.detail}>{(detail) => <Badge>{detail()}</Badge>}</Show>
                            </Menu.Item>
                          )}
                        </For>
                      </Menu.ItemGroup>
                    </Menu.Content>
                  </Menu.Positioner>
                </Menu.Root>
              )}
            </Match>
          </Switch>
        </span>
      )}
    </Show>
  )
}

function MenuPill(props: {
  view: ComposerPillView
  menu: (input: ComposerPillMenuProps) => JSX.Element
  input: ComposerPillProps
}): JSX.Element {
  const popover = usePopover({positioning: PLACEMENT})

  return (
    <Popover.RootProvider value={popover} lazyMount unmountOnExit>
      <Popover.Trigger
        asChild={(triggerProps) => (
          <Button {...triggerProps()} variant="outline" size="none" class={PILL} aria-label={props.view.title}>
            <PillContent view={props.view} />
          </Button>
        )}
      />
      <Popover.Positioner>
        <Popover.Content class={PANEL}>
          <Popover.Title class={HEADING}>
            <span dir="auto">{props.view.title ?? props.view.label}</span>
          </Popover.Title>
          <div class={PANEL_BODY}>
            {untrack(() =>
              props.menu({
                get session() {
                  return props.input.session
                },
                get screen() {
                  return props.input.screen
                },
                close: () => popover().setOpen(false),
              }),
            )}
          </div>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.RootProvider>
  )
}

function PillContent(props: {view: ComposerPillView}): JSX.Element {
  return (
    <>
      <PillIcon name={props.view.icon} tone={props.view.tone} />
      <span dir="auto" class="min-w-0 max-w-60 truncate">
        {props.view.label}
      </span>
    </>
  )
}

function PillIcon(props: {name?: IconName; tone?: ComposerPillTone}): JSX.Element {
  return (
    <Show when={props.name}>
      {(name) => (
        <Icon name={name()} class={`shrink-0 size-3.5 ${props.tone ? TONE[props.tone] : 'text-chat-text-3'}`} />
      )}
    </Show>
  )
}
