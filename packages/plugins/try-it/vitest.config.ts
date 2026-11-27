import {defineConfig} from 'vitest/config'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({plugins: [UnoCSS(), solid(), concivTest({browser: true})]})
