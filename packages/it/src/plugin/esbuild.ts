import type concivPlugin from '@conciv/plugin/esbuild'
import {unplugin} from '../plugin-instance.js'

const plugin: typeof concivPlugin = unplugin.esbuild

export default plugin
