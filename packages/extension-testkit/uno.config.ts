import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {filesystem: ['src/**/*.{ts,tsx}', 'fixtures/**/*.{ts,tsx}']},
  presets: [presetConciv()],
})
