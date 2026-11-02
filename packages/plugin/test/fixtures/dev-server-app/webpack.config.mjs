import conciv from '@conciv/plugin/webpack'

export default {
  mode: 'development',
  context: import.meta.dirname,
  entry: './src/index.js',
  plugins: [conciv(JSON.parse(process.env.CONCIV_OPTIONS ?? '{}'))],
  devServer: {hot: false, liveReload: false, client: false, static: false},
}
