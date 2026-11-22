import {defineConfig} from '@rspack/cli'
import {rspack} from '@rspack/core'

export default defineConfig({
  plugins: [
    new rspack.HtmlRspackPlugin({template: './index.html', title: 'rspack shop'}),
    new rspack.CopyRspackPlugin({patterns: [{from: 'public'}]}),
  ],
})
