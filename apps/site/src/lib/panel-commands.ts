import {createEventBusClient, PANEL_PLUGIN_ID, type PanelCommandEventMap} from '@conciv/types/event-bus'

export const panelCommands = createEventBusClient<PanelCommandEventMap>({
  pluginId: PANEL_PLUGIN_ID,
  target: () => window,
  reconnectEveryMs: 500,
  maxRetries: 60,
})
