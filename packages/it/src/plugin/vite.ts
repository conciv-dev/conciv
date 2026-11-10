import type concivPlugin from '@conciv/plugin/vite'
import {unplugin} from '../plugin-instance.js'

const plugin: typeof concivPlugin = unplugin.vite

export default plugin
export type {ConcivConfig} from '@conciv/plugin/vite'
