import {fileURLToPath} from 'node:url'

export default {
  resolve: {
    alias: {
      '@conciv/ui-kit-system': fileURLToPath(new URL('../../../../../ui-kit-system/src/index.tsx', import.meta.url)),
      '@app': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        xray: 'xray.html',
        overlay: '../../../../../extensions/design/src/xray/overlay.tsx',
      },
    },
  },
}
