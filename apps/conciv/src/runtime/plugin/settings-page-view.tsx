import {For} from 'solid-js'
import {TabsPrimitive as Tabs} from '@conciv/ui-kit-system'
import {Contribution} from './render'
import {createSettingsPages} from './settings-pages'

export function PluginSettingsPages() {
  const plugins = createSettingsPages()

  return (
    <For each={plugins.pages()}>
      {(item) => (
        <Tabs.Content value={item.value.id}>
          <Contribution plugin={item.plugin}>
            {() =>
              item.value.render({
                get target() {
                  return undefined
                },
              })
            }
          </Contribution>
        </Tabs.Content>
      )}
    </For>
  )
}

export function PluginSettingsSections(props: {page: 'general'; section?: 'general'}) {
  const plugins = createSettingsPages()

  return (
    <For each={plugins.sections(props.page, props.section)}>
      {(item) => (
        <Contribution plugin={item.plugin}>
          {() =>
            item.value.render({
              get target() {
                return undefined
              },
            })
          }
        </Contribution>
      )}
    </For>
  )
}
