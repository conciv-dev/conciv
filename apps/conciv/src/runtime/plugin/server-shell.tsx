import {createMemo, Show, type ParentProps} from 'solid-js'
import {Contribution} from './render'
import {usePluginServers} from './servers'

export function PluginServerCover(props: ParentProps) {
  const servers = usePluginServers()

  const covered = createMemo(() => {
    const source = servers.routed()

    if (!source?.entry.cover || source.entry.state === 'ready') return

    return source.key
  })

  return (
    <div class="flex flex-1 flex-col min-h-0 min-w-0 relative">
      <div
        class="flex flex-1 flex-col min-h-0 min-w-0"
        classList={{invisible: !!covered()}}
        inert={!!covered()}
        aria-hidden={covered() ? true : undefined}
      >
        {props.children}
      </div>
      <Show when={covered()} keyed>
        {(key) => {
          const source = servers.entry(key)
          const cover = source?.entry.cover

          if (!source || !cover) return null

          return (
            <div class="inset-0 absolute">
              <Contribution plugin={source.plugin}>{() => cover({tab: undefined})}</Contribution>
            </div>
          )
        }}
      </Show>
    </div>
  )
}
