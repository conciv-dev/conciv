import {createEffect, createMemo, For, mergeProps, on, Show, type Accessor, type JSX} from 'solid-js'
import {
  Panel,
  type MountedSession,
  type PanelFrame,
  type PanelTab,
  type SessionScreen,
} from '@conciv/plugin/experimental'
import {PanelContext} from '@conciv/plugin/experimental/host'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../../lib/media-query'
import {viewTabId, viewTabPanelId} from '../../pane/view-tab-ids'
import {same} from '../persistence/equality'
import {usePluginHost} from './host'
import {Contribution} from './render'
import {panelKey} from './panel-keys'

type Tabs = Accessor<{
  all(): string[]
  active(): string | undefined
  setActive(tab: string | undefined): void
  close(tab: string): void
  remap(rewrite: (tab: string) => string): void
}>

export type RegionEntry = {
  readonly key: string
  readonly plugin: string
  readonly tab: PanelTab
  readonly provider: Panel
}

export type RegionPane = {
  readonly entries: Accessor<RegionEntry[]>
  readonly active: Accessor<string | undefined>
  readonly selected: Accessor<RegionEntry | undefined>
  readonly openFor: (plugin: string) => string[]
}

export function createRegion(input: {
  region: Panel['region']
  view: Accessor<MountedSession>
  screen: SessionScreen
  tabs: Tabs
}) {
  const host = usePluginHost()
  const stored = () => input.tabs().all()
  const providers = createMemo(() => host.items(Panel).filter((item) => item.value.region === input.region))

  const entries = createMemo<RegionEntry[]>(
    (previous) => {
      const prior = new Map(previous.map((entry) => [entry.key, entry]))

      return providers().flatMap((item) => {
        const prefix = `${item.plugin}:`
        const open = stored().flatMap((key) => (key.startsWith(prefix) ? [key.slice(prefix.length)] : []))

        return item.value.list(panelInput(input.view, input.screen, {open})).map((tab): RegionEntry => {
          const key = panelKey(item.plugin, tab.id)
          const existing = prior.get(key)

          if (existing && existing.tab === tab && existing.provider === item.value) return existing

          return {
            key,
            plugin: item.plugin,
            tab,
            provider: item.value,
          }
        })
      })
    },
    [],
    {equals: same},
  )

  const byKey = createMemo(() => new Map(entries().map((entry) => [entry.key, entry])))

  createEffect(() => {
    const normalizers = providers().flatMap((item) => (item.value.normalize ? [item] : []))

    if (normalizers.length === 0) return

    const rewrite = (key: string) => {
      const item = normalizers.find((provider) => key.startsWith(`${provider.plugin}:`))

      if (!item?.value.normalize) return key

      return panelKey(
        item.plugin,
        item.value.normalize(
          panelInput(input.view, input.screen, {
            id: key.slice(item.plugin.length + 1),
          }),
        ),
      )
    }

    input.tabs().remap(rewrite)
  })

  const strip = createMemo(() => {
    const listed = stored().flatMap((key) => {
      const entry = byKey().get(key)

      return entry && !entry.tab.pinned ? [entry] : []
    })

    return [...entries().filter((entry) => entry.tab.pinned), ...listed]
  })

  const phone = createMediaQuery(PHONE_MEDIA_QUERY)

  const active = createMemo(() => {
    const value = input.tabs().active()

    if (value && strip().some((entry) => entry.key === value && (!phone() || !entry.tab.transient))) return value

    return undefined
  })

  createEffect(
    on(active, (key, _, restored: boolean = true) => {
      const entry = key ? byKey().get(key) : undefined

      if (entry)
        entry.provider.focus?.(
          panelInput(input.view, input.screen, {
            tab: entry.tab,
            restored,
          }),
        )

      return false
    }),
  )

  const drawn = createMemo(() => strip().filter((entry) => !entry.tab.hidden))

  const selected = createMemo(() => {
    const key = active()

    return key ? byKey().get(key) : undefined
  })

  const openFor = (plugin: string) =>
    stored().flatMap((key) => (key.startsWith(`${plugin}:`) ? [key.slice(plugin.length + 1)] : []))

  const pane: RegionPane = {
    entries,
    active,
    selected,
    openFor,
  }

  return {
    entries,
    keys: createMemo(() => drawn().map((entry) => entry.key), [], {equals: same}),
    entry: (key: string) => byKey().get(key),
    active,
    selected,
    pane,
    openFor,
    select(key: string) {
      input.tabs().setActive(key)
    },
    close(key: string) {
      const entry = byKey().get(key)

      input.tabs().close(key)

      if (entry)
        entry.provider.close?.(
          panelInput(input.view, input.screen, {
            tab: entry.tab,
          }),
        )
    },
  }
}

export type Region = ReturnType<typeof createRegion>

export function RegionContent(props: {
  pane: RegionPane
  view: MountedSession
  screen: SessionScreen
  frame: Omit<PanelFrame, 'visible' | 'open'> & {shown: Accessor<boolean>}
}) {
  const groups = createMemo(() =>
    Array.from(new Set(props.pane.entries().flatMap((entry) => (entry.tab.group ? [groupKey(entry)] : [])))),
  )

  const kept = createMemo<{key: string | undefined; session: string}>((previous) => {
    const entry = props.pane.selected()
    const session = props.view.key

    if (!entry && previous?.key && previous.session !== session) return previous

    return {key: entry && !entry.tab.group ? entry.key : undefined, session}
  })

  const single = () => kept().key

  const shown = () => props.pane.selected()?.key === single()

  return (
    <>
      <For each={groups()}>
        {(group) => {
          const active = () => {
            const entry = props.pane.selected()

            return !!entry && groupKey(entry) === group
          }

          const member = createMemo<RegionEntry | undefined>((previous) => {
            const members = props.pane.entries().filter((entry) => groupKey(entry) === group)
            const selected = props.pane.selected()

            if (selected && groupKey(selected) === group) return selected

            return members.find((entry) => entry.key === previous?.key) ?? members[0]
          })

          return (
            <Show when={member()?.plugin} keyed>
              {(plugin) => (
                <div
                  id={dom(member())?.panel}
                  role="tabpanel"
                  aria-labelledby={active() && !member()?.tab.hidden ? dom(member())?.tab : undefined}
                  class="h-full min-h-0 overflow-hidden"
                  classList={{hidden: !active()}}
                  inert={!active() || undefined}
                >
                  <PanelContext.Provider
                    value={{
                      ...props.frame,
                      visible: () => props.frame.shown() && active(),
                      open: () => props.pane.openFor(plugin),
                    }}
                  >
                    <Contribution plugin={plugin}>
                      {() =>
                        member()!.provider.render(
                          panelInput(() => props.view, props.screen, {
                            get tab() {
                              return member()!.tab
                            },
                          }),
                        )
                      }
                    </Contribution>
                  </PanelContext.Provider>
                </div>
              )}
            </Show>
          )
        }}
      </For>
      <Show when={single()} keyed>
        {(key) => {
          const entry = createMemo(() => props.pane.entries().find((item) => item.key === key))

          return (
            <Show when={entry()?.plugin} keyed>
              {(plugin) => (
                <div
                  id={dom(entry())?.panel}
                  role="tabpanel"
                  aria-labelledby={entry()?.tab.hidden ? undefined : dom(entry())?.tab}
                  tabIndex={entry()?.tab.tabbable ? 0 : undefined}
                  class="flex flex-col h-full overflow-hidden contain-strict"
                  classList={{'absolute inset-0 content-visibility-hidden': !shown()}}
                  aria-hidden={!shown() || undefined}
                >
                  <PanelContext.Provider
                    value={{
                      ...props.frame,
                      visible: () => props.frame.shown() && shown(),
                      open: () => props.pane.openFor(plugin),
                    }}
                  >
                    <Contribution plugin={plugin}>
                      {() =>
                        entry()!.provider.render(
                          panelInput(() => props.view, props.screen, {
                            get tab() {
                              return entry()!.tab
                            },
                          }),
                        )
                      }
                    </Contribution>
                  </PanelContext.Provider>
                </div>
              )}
            </Show>
          )
        }}
      </Show>
    </>
  )
}

function groupKey(entry: RegionEntry) {
  return `${entry.plugin}/${entry.tab.group ?? entry.key}`
}

function dom(entry: RegionEntry | undefined) {
  return entry && {panel: viewTabPanelId(entry.key), tab: viewTabId(entry.key)}
}

export function panelInput<T extends object>(view: Accessor<MountedSession>, screen: SessionScreen, fields: T) {
  return mergeProps(
    {
      get session() {
        return view()
      },
      screen,
    },
    fields,
  )
}

export function MobilePanel(props: {
  entry: RegionEntry
  view: MountedSession
  screen: SessionScreen
  visible: boolean
  open: Accessor<readonly string[]>
}): JSX.Element {
  return (
    <PanelContext.Provider
      value={{
        visible: () => props.visible,
        present: () => props.visible,
        placement: () => 'mobile',
        animate: () => true,
        open: props.open,
      }}
    >
      <Contribution plugin={props.entry.plugin}>
        {() =>
          props.entry.provider.render(
            panelInput(() => props.view, props.screen, {
              get tab() {
                return props.entry.tab
              },
            }),
          )
        }
      </Contribution>
    </PanelContext.Provider>
  )
}
