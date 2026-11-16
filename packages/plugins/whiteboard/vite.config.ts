import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'

export default defineConfig({
  plugins: [experimental()],
  define: {'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.IS_PREACT': JSON.stringify('false')},
})
