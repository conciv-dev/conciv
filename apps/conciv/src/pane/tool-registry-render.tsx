import {createMemo, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {keyBy, mapValues} from 'es-toolkit'
import {ToolRegistry, type ToolComponent, type ToolProps} from '@conciv/plugin/experimental'
import {GenericTool} from '@conciv/ui-kit-chat/tools'
import {usePluginHost, type Item} from '../runtime/plugin/host'
import {Contribution} from '../runtime/plugin/render'
import {usePluginsKnown} from '../runtime/plugin/root'

function contributed(item: Item<ToolRegistry>, render: ToolComponent): ToolComponent {
  return (props: ToolProps): JSX.Element => (
    <Contribution plugin={item.plugin} fallback={() => <GenericTool {...props} />}>
      {() => <Dynamic component={render} {...props} />}
    </Contribution>
  )
}

export type ToolRender = {
  ready: () => boolean
  render: (name: string) => ToolComponent | undefined
}

export function createToolRender(): ToolRender {
  const host = usePluginHost()
  const known = usePluginsKnown()
  const renders = createMemo(() =>
    mapValues(
      keyBy(host.items(ToolRegistry), (item) => item.value.name),
      (item) => (item.value.render === undefined ? undefined : contributed(item, item.value.render)),
    ),
  )
  return {ready: () => host.ready() && known() === 'known', render: (name) => renders()[name]}
}
