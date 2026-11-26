import {createMemo, mapArray, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {keyBy, mapValues} from 'es-toolkit'
import {ToolRegistry, type ToolComponent, type ToolProps} from '@conciv/frontend-plugin-api'
import {GenericTool, ToolErrorCard} from '@conciv/ui-kit-chat/tools'
import {usePluginHost, type Item} from '@internal/frontend-app-api/plugin/host'
import {Contribution} from '@internal/frontend-app-api/plugin/render'
import {usePluginsKnown} from '../runtime/plugin/root'
import {useEngineReachability} from '../app/reachability'

function contributed(item: Item<ToolRegistry>, render: ToolComponent, Fallback: ToolComponent): ToolComponent {
  return (props: ToolProps): JSX.Element => (
    <Contribution plugin={item.plugin} fallback={() => <Fallback {...props} />}>
      {() => <Dynamic component={render} {...props} />}
    </Contribution>
  )
}

function FailedTool(props: ToolProps): JSX.Element {
  return (
    <ToolErrorCard
      tool={props.tool}
      error={props.error ?? ''}
      defaultOpen={props.defaultOpen}
      open={props.open}
      onOpenChange={props.onOpenChange}
    />
  )
}

export type ToolRender = {
  pending: () => boolean
  render: (name: string) => ToolRegistry | undefined
}

export function createToolRender(): ToolRender {
  const host = usePluginHost()
  const known = usePluginsKnown()
  const reachability = useEngineReachability()
  const wrapped = createMemo(
    mapArray(
      () => host.items(ToolRegistry),
      (item): ToolRegistry => ({
        name: item.value.name,
        render: item.value.render === undefined ? undefined : contributed(item, item.value.render, GenericTool),
        errorComponent:
          item.value.errorComponent === undefined
            ? FailedTool
            : contributed(item, item.value.errorComponent, FailedTool),
      }),
    ),
  )
  const renders = createMemo(() =>
    mapValues(
      keyBy(wrapped(), (entry) => entry.name),
      (entry) => entry,
    ),
  )
  return {
    pending: () => reachability.locked() === null && !(host.ready() && known() === 'known'),
    render: (name) => renders()[name],
  }
}
