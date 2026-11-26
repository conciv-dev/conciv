import type {Plugin} from '@conciv/frontend-plugin-api'
import terminal from './client.js'

export const builtins: readonly [{readonly id: string; readonly plugin: Plugin.Definition}] = [
  {id: 'terminal', plugin: terminal},
]
