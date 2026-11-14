import {createEffect, createMemo, For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Panel, type MountedSession, type PanelTab, type SessionScreen} from '@conciv/plugin/experimental'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../../lib/media-query'
import {viewTabPanelAttributes} from '../../pane/view-tab-ids'
import {usePluginAttachment} from './attachment'
import {usePluginHost} from './host'
import {panelKey} from './panel-keys'
import {MobilePanel, type Region, type RegionEntry} from './panels'

export type MobileEntry = RegionEntry & {readonly mobile: NonNullable<Panel['mobile']>}

export function createMobileViews() {
  const host = usePluginHost()

  const entries = createMemo(() =>
    host.items(Panel).flatMap((item): MobileEntry[] => {
      const mobile = item.value.mobile

      if (!mobile) return []
      const tab: PanelTab = {id: item.value.id, title: mobile.title}

      return [{key: panelKey(item.plugin, item.value.id), plugin: item.plugin, tab, provider: item.value, mobile}]
    }),
  )

  const sorted = (kinds: readonly string[]) =>
    entries()
      .filter((entry) => kinds.includes(entry.mobile.kind))
      .toSorted((a, b) => a.mobile.order - b.mobile.order)

  return {
    entries,
    tabs: createMemo(() => sorted(['tab'])),
    menu: createMemo(() => sorted(['menu', 'drawer'])),
    find: (key: string) => entries().find((entry) => entry.key === key),
  }
}

export type MobileViews = ReturnType<typeof createMobileViews>

export function MobileViewContent(props: {region: Region; view: MountedSession; screen: SessionScreen}): JSX.Element {
  const attachment = usePluginAttachment()
  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const mobile = createMobileViews()
  const mobileView = attachment.mobile.current
  const [store, setStore] = createStore<{mobileCached: string[]}>({mobileCached: []})

  const mobileEntry = createMemo(() => {
    const key = mobileView()

    return key === 'session' ? undefined : mobile.find(key)
  })

  createEffect(() => {
    const entry = mobileEntry()

    if (!phone() || !entry?.mobile.cached || store.mobileCached.includes(entry.key)) return
    setStore('mobileCached', (keys) => [...keys, entry.key])
  })

  const cachedViews = createMemo(() => store.mobileCached.flatMap((key) => mobile.find(key) ?? []))

  const frame = (entry: MobileEntry, visible: () => boolean) => (
    <div
      {...viewTabPanelAttributes(entry.key)}
      class={visible() ? 'relative flex flex-1 flex-col min-h-0' : 'absolute inset-0 invisible'}
      inert={!visible() || undefined}
    >
      <MobilePanel
        entry={entry}
        view={props.view}
        screen={props.screen}
        visible={visible()}
        open={() => props.region.openFor(entry.plugin)}
      />
    </div>
  )

  return (
    <Show when={phone()}>
      <For each={cachedViews()}>{(entry) => frame(entry, () => mobileView() === entry.key)}</For>
      <Show when={mobileEntry()?.mobile.cached ? undefined : mobileEntry()} keyed>
        {(entry) => frame(entry, () => true)}
      </Show>
    </Show>
  )
}
