import {createMemo} from 'solid-js'
import {SettingsPage} from '@conciv/plugin/experimental'
import {usePluginHost} from './host'

export function createSettingsPages() {
  const host = usePluginHost()
  const items = createMemo(() => host.items(SettingsPage))

  const pages = createMemo(() => items().filter((item) => !item.value.page))
  const tabs = createMemo<ReadonlySet<string>>(() => new Set(pages().map((item) => item.value.id)))

  return {
    items,
    pages,
    tabs,
    sections: (page: 'general', section?: 'general') =>
      items().filter((item) => item.value.page === page && item.value.section === section),
  }
}
