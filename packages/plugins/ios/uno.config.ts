import {presetConciv} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  content: {filesystem: ['src/client.tsx']},
  presets: [presetConciv()],
})
