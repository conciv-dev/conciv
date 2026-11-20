import type {UnpluginInstance} from 'unplugin'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {unplugin} from './index.js'

const plugin: UnpluginInstance<ConcivConfig | undefined>['esbuild'] = unplugin.esbuild

export default plugin
export type {ConcivConfig}
