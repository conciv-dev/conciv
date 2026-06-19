import UnoCSS from '@unocss/postcss'

// Expands `@unocss all;` (in src/tool-ui.css) into generated utilities. Used by Storybook's Vite CSS
// pipeline for live dev; the shipped dist/tool-ui.css is produced the same way by scripts/build-css.mjs.
// Config (presets, content globs) lives in uno.config.ts.
export default {
  plugins: [UnoCSS()],
}
