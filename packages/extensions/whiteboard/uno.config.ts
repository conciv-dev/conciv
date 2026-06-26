import {presetAidx} from '@mandarax/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {filesystem: ['src/**/*.{ts,tsx}']},
  presets: [presetAidx()],
})
