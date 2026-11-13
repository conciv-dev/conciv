import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {filesystem: ['src/**/*.{ts,tsx}', 'test/fixtures/**/*.{ts,tsx}']},
  presets: [presetConciv()],
})
