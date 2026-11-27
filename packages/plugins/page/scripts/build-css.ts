import {fileURLToPath} from 'node:url'
import {pluginSheetConfig} from '@internal/uno-preset'
import {buildShadowCss} from '@internal/uno-preset/build-shadow-css'

const packageUrl = new URL('..', import.meta.url).href
const {sourceCount, css} = await buildShadowCss({
  srcDir: fileURLToPath(new URL('src', packageUrl)),
  globs: ['**/*.{ts,tsx}'],
  config: pluginSheetConfig(packageUrl),
})
console.log(`CSS built (${sourceCount} sources, ${(css.length / 1024).toFixed(1)} kB)`)
