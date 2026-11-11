import type concivPlugin from '@conciv/plugin/rollup'
import {unplugin} from '../plugin-instance.js'

const plugin: typeof concivPlugin = unplugin.rollup

export default plugin
