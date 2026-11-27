import {defineConfig} from 'vite'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({plugins: [experimental(), concivTest({browser: true})], publicDir: false})
