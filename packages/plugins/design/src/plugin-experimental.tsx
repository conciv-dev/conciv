import {Plugin, SettingsPage, Style, ToolRegistry} from '@conciv/frontend-plugin-api'
import pluginCss from './.generated/css.js'
import {FIGMA_KEY_SETTINGS} from './key/figma-key-model.js'
import {DesignGetFailed, FigmaKeySettings} from './key/figma-key-views.js'

const design: Plugin.Definition = Plugin.define({
  setup(ctx) {
    ctx.add(Style, pluginCss)
    ctx.add(SettingsPage, {
      id: FIGMA_KEY_SETTINGS,
      title: 'Figma',
      icon: 'lock',
      entries: [{id: 'figma-api-key', title: 'Figma API key', keywords: 'figma key token design'}],
      render: () => <FigmaKeySettings />,
    })
    ctx.add(ToolRegistry, {name: 'design_get', errorComponent: DesignGetFailed})
  },
})

export default design
