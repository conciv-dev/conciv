import {defineConfig} from 'vitest/config'
import solid from 'vite-plugin-solid'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({plugins: [solid(), concivTest()]})
