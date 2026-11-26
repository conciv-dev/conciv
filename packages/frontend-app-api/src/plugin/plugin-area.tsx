import {createMemo, type ParentProps} from 'solid-js'
import {LayerAreaContext} from '@conciv/ui-kit-system'
import {PLUGIN_AREA_ATTRIBUTE} from '../lib/plugin-fence'

export function PluginArea(props: ParentProps<{plugin: string}>) {
  const area = createMemo(() => ({[PLUGIN_AREA_ATTRIBUTE]: props.plugin}))

  return (
    <div {...area()} class="contents">
      <LayerAreaContext.Provider value={area}>{props.children}</LayerAreaContext.Provider>
    </div>
  )
}
