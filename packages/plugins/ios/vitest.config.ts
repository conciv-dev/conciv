import {defineConfig} from 'vitest/config'
import UnoCSS from 'unocss/vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({plugins: [UnoCSS(), solid(), concivTest()]})
