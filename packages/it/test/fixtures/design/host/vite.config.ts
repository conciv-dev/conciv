import {fileURLToPath} from 'node:url'

export default {
  resolve: {
    alias: {
      '@conciv/ui-kit-system': fileURLToPath(new URL('../../../../../ui-kit-system/src/index.tsx', import.meta.url)),
    },
  },
  build: {rolldownOptions: {input: {main: 'index.html', xray: 'xray.html'}}},
}
