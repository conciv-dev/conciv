import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'
import {inlineImports} from '@internal/build-plugins'

export default defineConfig({
  entry: [
    'src/ui-kit-chat.tsx',
    'src/tools.tsx',
    'src/draft-storage.ts',
    'src/theme/fonts.ts',
    'src/theme/code-theme.ts',
  ],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  unbundle: true,
  fixedExtension: false,
  deps: {alwaysBundle: [/\?(?:worker&)?inline$/]},
  plugins: [inlineImports(), solid()],
})
