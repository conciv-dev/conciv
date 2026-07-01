import UnoCSS from '@unocss/postcss'

// Expands `@unocss all;` (in .storybook/storybook.css) into generated utilities for Storybook's Vite
// CSS pipeline. Config (preset, content globs) lives in uno.config.ts.
export default {
  plugins: [UnoCSS()],
}
