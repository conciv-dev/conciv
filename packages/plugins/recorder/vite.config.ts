import {defineConfig} from 'vite'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({plugins: [UnoCSS(), experimental(), concivTest({browser: true})]})
