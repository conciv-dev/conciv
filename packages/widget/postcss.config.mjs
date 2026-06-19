import UnoCSS from '@unocss/postcss'

// Expands the `@unocss all;` directive in styles.css into the generated utilities during Vite's CSS
// transform, so `styles.css?inline` carries them into the shadow root. Runs in the PostCSS step (not a
// rolldown chunk hook), so it works in the vite@8 build where the UnoCSS vite plugin's shadow-dom mode
// does not. Config (presets, content globs) lives in uno.config.ts.
export default {
  plugins: [UnoCSS()],
}
