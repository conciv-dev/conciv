import {compose} from '@conciv/plugin/experimental/host'
import {builtins as packageBuiltins} from '@conciv/builtin-plugins/renderer'

export const builtins = [
  ...packageBuiltins,
  ...compose({grab: {windowEntry: () => import('./grab-provider').then(({provideGrab}) => ({default: provideGrab}))}}),
]

export const BUILTINS_UPDATED = 'conciv:experimental-plugins-updated'
