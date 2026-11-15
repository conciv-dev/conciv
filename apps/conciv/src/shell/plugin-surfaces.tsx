import {createMemo, For, onCleanup, Show, untrack, type Accessor} from 'solid-js'
import {Navigate, getRouteApi, useRouter} from '@tanstack/solid-router'
import {Panel, Slot, type MountedSession, type SessionScreen} from '@conciv/plugin/experimental'
import {useLayers} from '../app/context'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../lib/media-query'
import {usePluginAttachment} from '../runtime/plugin/attachment'
import {usePluginHost} from '../runtime/plugin/host'
import {icons} from '../runtime/plugin/icons'
import {createMobileViews, MobileViewContent, type MobileViews} from '../runtime/plugin/mobile'
import {createMountedSession} from '../runtime/plugin/mounted-session'
import {isPluginView, panelKey} from '../runtime/plugin/panel-keys'
import {PanelTrigger} from '../runtime/plugin/panel-trigger'
import {createRegion, panelInput, RegionContent} from '../runtime/plugin/panels'
import {PluginSlot} from '../runtime/plugin/render'
import {usePluginsKnown} from '../runtime/plugin/root'

type RouteTabs = Parameters<typeof createRegion>[0]['tabs']

const viewRoute = getRouteApi('/panel/$sessionId/$view')

export function createPluginTabs(input: {
  view: Accessor<string>
  extensionViews: Accessor<readonly {readonly id: string}[]>
  chat: () => void
  show: (view: string) => void
}) {
  const attachment = usePluginAttachment()

  const routed = () => {
    const view = input.view()

    return isPluginView(view, input.extensionViews()) ? view : undefined
  }

  const tabs = {
    all: () => {
      const key = routed()

      return key ? [key] : []
    },
    active: routed,
    setActive: (key: string | undefined) => (key === undefined ? input.chat() : input.show(key)),
    close: (key: string) => {
      if (key === untrack(routed)) input.chat()
    },
    remap: (rewrite: (key: string) => string) => {
      const key = routed()

      if (key === undefined) return
      const next = rewrite(key)

      if (next !== key) input.show(next)
    },
  }

  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const mobile = createMobileViews()

  const views = () => {
    const region = attachment.shownRegion()

    if (!region) return []

    const panelTabs = region.keys().flatMap((key) => {
      const entry = region.entry(key)

      if (phone() && entry?.provider.mobile) return []

      return [
        {
          id: key,
          label: entry?.tab.title ?? key,
          content: () => <PluginTabTrigger value={key} />,
          missing: entry?.tab.missing,
        },
      ]
    })

    if (!phone()) return panelTabs

    return [
      ...[...mobile.tabs(), ...mobile.menu()].map((entry) => ({
        id: entry.key,
        label: entry.mobile.title,
        icon: entry.mobile.icon && icons[entry.mobile.icon],
      })),
      ...panelTabs,
    ]
  }

  return {tabs, views}
}

function PluginTabTrigger(props: {value: string}) {
  const attachment = usePluginAttachment()

  return (
    <Show when={attachment.shownRegion()?.entry(props.value)}>
      {(entry) => (
        <Show when={attachment.current()}>
          {(session) => (
            <PanelTrigger
              value={props.value}
              plugin={entry().plugin}
              tab={entry().tab}
              session={session()}
              active={attachment.shownRegion()?.active() === props.value}
              preview={false}
            />
          )}
        </Show>
      )}
    </Show>
  )
}

type PluginHost = ReturnType<typeof usePluginHost>

const paneProviders = (host: PluginHost) => host.items(Panel).filter((item) => item.value.region === 'pane')

type PaneProvider = ReturnType<typeof paneProviders>[number]

function listed(item: PaneProvider, key: string, view: MountedSession, screen: SessionScreen) {
  try {
    return item.value
      .list(panelInput(() => view, screen, {open: [key.slice(item.plugin.length + 1)]}))
      .some((tab) => panelKey(item.plugin, tab.id) === key)
  } catch (cause) {
    console.error(`[plugin] ${item.plugin} panel list failed`, cause)

    return false
  }
}

function renamed(item: PaneProvider, key: string, view: MountedSession, screen: SessionScreen) {
  const normalize = item.value.normalize

  if (!normalize) return false
  try {
    return (
      panelKey(item.plugin, normalize(panelInput(() => view, screen, {id: key.slice(item.plugin.length + 1)}))) !== key
    )
  } catch (cause) {
    console.error(`[plugin] ${item.plugin} panel normalize failed`, cause)

    return false
  }
}

function routedKeyStatus(input: {
  providers: readonly PaneProvider[]
  sessionId: string
  key: string
  view: MountedSession | undefined
  screen: SessionScreen | undefined
  phone: boolean
  mobile: MobileViews
}) {
  const owners = input.providers.filter((item) => input.key.startsWith(`${item.plugin}:`))

  if (owners.length === 0) return 'unlisted'
  if (input.phone && input.mobile.find(input.key)) return 'listed'
  const view = input.view
  const screen = input.screen

  if (view?.id !== input.sessionId || !screen) return 'listed'
  const normalizer = owners.find((item) => item.value.normalize)

  if (normalizer && renamed(normalizer, input.key, view, screen)) return 'listed'

  return owners.some((item) => listed(item, input.key, view, screen)) ? 'listed' : 'unlisted'
}

export function PluginPanelKeys() {
  const host = usePluginHost()
  const attachment = usePluginAttachment()
  const known = usePluginsKnown()
  const panels = useRouter().options.context.pluginPanels
  const providers = createMemo(() => paneProviders(host))
  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const mobile = createMobileViews()

  onCleanup(
    panels.bind(({sessionId, key}) =>
      untrack(() => {
        if (!host.ready() || known() === 'pending') return 'pending'

        return routedKeyStatus({
          providers: providers(),
          sessionId,
          key,
          view: attachment.current(),
          screen: attachment.shownScreen(),
          phone: phone(),
          mobile,
        })
      }),
    ),
  )

  return null
}

export function PluginOverlay() {
  const host = usePluginHost()
  const layers = useLayers()
  const overlays = createMemo(() =>
    host.items(Slot).flatMap((item) => (item.value.at === 'page.overlay' ? [item.value] : [])),
  )

  return (
    <Show when={host.ready()}>
      <For each={overlays()}>
        {(overlay) => {
          onCleanup(layers.register(() => true, overlay.hides))

          return null
        }}
      </For>
      <PluginSlot at="page.overlay" input={{}} />
    </Show>
  )
}

export function PluginWindowBottom() {
  const host = usePluginHost()

  return (
    <Show when={host.ready()}>
      <PluginSlot at="window.bottom" input={{}} />
    </Show>
  )
}

export function PluginSession(props: {sessionId: string}) {
  createMountedSession({id: () => props.sessionId})

  return null
}

export function PluginRegion(props: {view: Accessor<MountedSession>; screen: SessionScreen; tabs: RouteTabs}) {
  const attachment = usePluginAttachment()
  const region = createRegion({
    region: 'pane',
    view: () => props.view(),
    screen: untrack(() => props.screen),
    tabs: () => props.tabs(),
  })

  onCleanup(attachment.region(region))

  return <MobileViewContent region={region} view={props.view()} screen={props.screen} />
}

export function PluginTabContent() {
  const params = viewRoute.useParams()
  const attachment = usePluginAttachment()
  const host = usePluginHost()
  const known = usePluginsKnown()
  const providers = createMemo(() => paneProviders(host))
  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const mobile = createMobileViews()

  return (
    <Show when={host.ready() && known() === 'known' ? attachment.shownRegion() : undefined}>
      {(region) => (
        <Show when={attachment.current()}>
          {(view) => (
            <Show when={attachment.shownScreen()} keyed>
              {(screen) => (
                <Show
                  when={
                    routedKeyStatus({
                      providers: providers(),
                      sessionId: params().sessionId,
                      key: params().view,
                      view: view(),
                      screen,
                      phone: phone(),
                      mobile,
                    }) === 'listed'
                  }
                  fallback={<Navigate to="/panel/$sessionId" params={{sessionId: params().sessionId}} replace />}
                >
                  <Show when={!phone() || !mobile.find(params().view)}>
                    <div class="relative flex flex-1 flex-col min-h-0">
                      <RegionContent
                        pane={region().pane}
                        view={view()}
                        screen={screen}
                        frame={{
                          placement: () => 'pane',
                          present: () => true,
                          animate: () => false,
                          shown: () => true,
                        }}
                      />
                    </div>
                  </Show>
                </Show>
              )}
            </Show>
          )}
        </Show>
      )}
    </Show>
  )
}
