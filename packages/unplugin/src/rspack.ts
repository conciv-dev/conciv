import type {UnpluginInstance} from 'unplugin'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {unplugin} from './index.js'

const plugin: UnpluginInstance<ConcivConfig | undefined>['rspack'] = unplugin.rspack

export default plugin
export type {ConcivConfig}
