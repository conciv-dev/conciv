import {createMemo, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {keyBy, mapValues} from 'es-toolkit'
import {ToolRegistry, type ToolComponent, type ToolProps} from '@conciv/plugin/experimental'
import {usePluginHost, type Item} from '../runtime/plugin/host'
import {Contribution} from '../runtime/plugin/render'

function contributed(item: Item<ToolRegistry>, render: ToolComponent): ToolComponent {
  return (props: ToolProps): JSX.Element => (
    <Contribution plugin={item.plugin}>{() => <Dynamic component={render} {...props} />}</Contribution>
  )
}

export function createToolRender(): (name: string) => ToolComponent | undefined {
  const host = usePluginHost()
  const renders = createMemo(() =>
    mapValues(
      keyBy(host.items(ToolRegistry), (item) => item.value.name),
      (item) => (item.value.render === undefined ? undefined : contributed(item, item.value.render)),
    ),
  )
  return (name) => renders()[name]
}
