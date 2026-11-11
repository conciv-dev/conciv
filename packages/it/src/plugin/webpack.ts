import type concivPlugin from '@conciv/plugin/webpack'
import {unplugin} from '../plugin-instance.js'

const plugin: typeof concivPlugin = unplugin.webpack

export default plugin
