import type {UnpluginInstance} from 'unplugin'
import type {ConcivConfig} from '@conciv/types/config-types'
import {unplugin} from './unplugin.js'

const plugin: UnpluginInstance<ConcivConfig | undefined>['rollup'] = unplugin.rollup

export default plugin
export type {ConcivConfig}
