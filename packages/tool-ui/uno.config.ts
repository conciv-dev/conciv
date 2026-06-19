import {presetAidx} from '@mandarax/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  // Scan tool-ui's own components plus the ui-kit-system primitives they render (the kit ships JS
  // only, no CSS) so tool-ui's Storybook generates every utility. Read by Storybook's postcss.
  content: {filesystem: ['src/**/*.{ts,tsx}', '../ui-kit-system/src/**/*.{ts,tsx}']},
  // presets/theme/shortcuts come from the shared @mandarax/uno-preset — same source of truth as the
  // widget, so cards render identically in the widget shadow root and in Storybook.
  presets: [presetAidx()],
})
