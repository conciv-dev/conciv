import {fileURLToPath} from 'node:url'
import {buildShadowCss} from '@internal/uno-preset/build-shadow-css'
import config from '../uno.config.ts'

const {sourceCount, css} = await buildShadowCss({
  srcDir: fileURLToPath(new URL('../src', import.meta.url)),
  globs: ['**/*.{ts,tsx}'],
  config,
})
console.log(`CSS built (${sourceCount} sources, ${(css.length / 1024).toFixed(1)} kB)`)
