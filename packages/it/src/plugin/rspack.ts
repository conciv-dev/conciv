import type concivPlugin from '@conciv/plugin/rspack'
import {unplugin} from '../plugin-instance.js'

const plugin: typeof concivPlugin = unplugin.rspack

export default plugin
