import type concivPlugin from '@conciv/unplugin/esbuild'
import {unplugin} from '../plugin-instance.js'

const plugin: typeof concivPlugin = unplugin.esbuild

export default plugin
