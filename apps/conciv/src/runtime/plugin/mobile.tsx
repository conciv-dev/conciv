import {createMemo} from 'solid-js'
import {Panel, type PanelTab} from '@conciv/plugin/experimental'
import {usePluginHost} from './host'
import {panelKey} from './panel-keys'
import type {RegionEntry} from './panels'

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
