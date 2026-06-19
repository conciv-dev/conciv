import {presetAidx} from '@mandarax/uno-preset'
import {defineConfig} from 'unocss'

export default defineConfig({
  // Scan the kit's components for utility classes (build-css.mjs + Storybook's postcss read this).
  content: {filesystem: ['src/**/*.{ts,tsx}']},
  // Same shared preset as tool-ui + widget, so primitives render identically across every surface.
  presets: [presetAidx()],
})
