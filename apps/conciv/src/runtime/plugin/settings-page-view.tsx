import {For, Show, createMemo} from 'solid-js'
import {Navigate, getRouteApi} from '@tanstack/solid-router'
import {usePluginHost} from './host'
import {panelKey} from './panel-keys'
import {Contribution} from './render'
import {createSettingsPages} from './settings-pages'

const pageRoute = getRouteApi('/panel/$sessionId_/settings/plugins/$page')

export function PluginSettingsPages() {
  const params = pageRoute.useParams()
  const host = usePluginHost()
  const plugins = createSettingsPages()
  const item = createMemo(() =>
    plugins.pages().find((candidate) => panelKey(candidate.plugin, candidate.value.id) === params().page),
  )

  return (
    <Show when={host.serversReady()}>
      <Show
        when={item()}
        keyed
        fallback={<Navigate to="/panel/$sessionId/settings/general" params={{sessionId: params().sessionId}} replace />}
      >
        {(page) => (
          <Contribution plugin={page.plugin}>
            {() =>
              page.value.render({
                get target() {
                  return undefined
                },
              })
            }
          </Contribution>
        )}
      </Show>
    </Show>
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
