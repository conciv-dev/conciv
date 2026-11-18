import {createMemo, mapArray, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {keyBy, mapValues} from 'es-toolkit'
import {ToolRegistry, type ToolComponent, type ToolProps} from '@conciv/plugin/experimental'
import {GenericTool} from '@conciv/ui-kit-chat/tools'
import {usePluginHost, type Item} from '../runtime/plugin/host'
import {Contribution} from '../runtime/plugin/render'
import {usePluginsKnown} from '../runtime/plugin/root'
import {useEngineReachability} from '../app/reachability'

function contributed(item: Item<ToolRegistry>, render: ToolComponent): ToolComponent {
  return (props: ToolProps): JSX.Element => (
    <Contribution plugin={item.plugin} fallback={() => <GenericTool {...props} />}>
      {() => <Dynamic component={render} {...props} />}
    </Contribution>
  )
}

export type ToolRender = {
  pending: () => boolean
  render: (name: string) => ToolComponent | undefined
}

export function createToolRender(): ToolRender {
  const host = usePluginHost()
  const known = usePluginsKnown()
  const reachability = useEngineReachability()
  const wrapped = createMemo(
    mapArray(
      () => host.items(ToolRegistry),
      (item) => ({
        name: item.value.name,
        render: item.value.render === undefined ? undefined : contributed(item, item.value.render),
      }),
    ),
  )
  const renders = createMemo(() =>
    mapValues(
      keyBy(wrapped(), (entry) => entry.name),
      (entry) => entry.render,
    ),
  )
  return {
    pending: () => reachability.locked() === null && !(host.ready() && known() === 'known'),
    render: (name) => renders()[name],
  }
}
