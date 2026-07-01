import {presetAidx} from '@conciv/uno-preset'
import {defineConfig} from 'unocss'

// The card renders pw-* utilities; the shared preset is the same source of truth as the widget +
// tool-ui, so the card looks identical in the widget shadow root. Read by the unocss/order lint.
export default defineConfig({
  content: {filesystem: ['src/**/*.{ts,tsx}']},
  presets: [presetAidx()],
})
