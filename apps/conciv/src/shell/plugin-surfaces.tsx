import {createMemo, For, onCleanup, Show, untrack, type Accessor} from 'solid-js'
import {useRouter} from '@tanstack/solid-router'
import {Panel, Slot, type MountedSession, type SessionScreen} from '@conciv/plugin/experimental'
import {useLayers} from '../app/context'
import {usePluginAttachment} from '../runtime/plugin/attachment'
import {usePluginHost} from '../runtime/plugin/host'
import {createMountedSession} from '../runtime/plugin/mounted-session'
import {isPluginView, panelKey} from '../runtime/plugin/panel-keys'
import {createRegion, panelInput, RegionContent} from '../runtime/plugin/panels'
import {PluginSlot} from '../runtime/plugin/render'

type RouteTabs = Parameters<typeof createRegion>[0]['tabs']

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
      const key = untrack(routed)

      if (key === undefined) return
      const next = rewrite(key)

      if (next !== key) input.show(next)
    },
  }

  const views = () => {
    const region = attachment.shownRegion()

    if (!region) return []

    return region.keys().map((key) => ({id: key, label: region.entry(key)?.tab.title ?? key}))
  }

  return {tabs, views}
}

export function PluginPanelKeys() {
  const host = usePluginHost()
  const attachment = usePluginAttachment()
  const panels = useRouter().options.context.pluginPanels
  const providers = createMemo(() => host.items(Panel).filter((item) => item.value.region === 'pane'))

  const listed = (
    item: ReturnType<typeof providers>[number],
    key: string,
    view: MountedSession,
    screen: SessionScreen,
  ) => {
    try {
      return item.value
        .list(panelInput(() => view, screen, {open: [key.slice(item.plugin.length + 1)]}))
        .some((tab) => panelKey(item.plugin, tab.id) === key)
    } catch (cause) {
      console.error(`[plugin] ${item.plugin} panel list failed`, cause)

      return false
    }
  }

  onCleanup(
    panels.bind(({sessionId, key}) => {
      if (!untrack(host.ready)) return 'pending'
      const owners = untrack(providers).filter((item) => key.startsWith(`${item.plugin}:`))

      if (owners.length === 0) return 'unlisted'
      const view = untrack(attachment.current)
      const screen = untrack(attachment.shownScreen)

      if (view?.id !== sessionId || !screen || owners.some((item) => item.value.normalize)) return 'listed'

      return owners.some((item) => listed(item, key, view, screen)) ? 'listed' : 'unlisted'
    }),
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

  return null
}

export function PluginTabContent() {
  const attachment = usePluginAttachment()
  const host = usePluginHost()

  return (
    <Show when={host.ready() ? attachment.shownRegion() : undefined}>
      {(region) => (
        <Show when={attachment.current()}>
          {(view) => (
            <Show when={attachment.shownScreen()} keyed>
              {(screen) => (
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
              )}
            </Show>
          )}
        </Show>
      )}
    </Show>
  )
}
