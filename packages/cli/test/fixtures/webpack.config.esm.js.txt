import TerserPlugin from 'terser-webpack-plugin'

export default {
  entry: './src/index.js',
  plugins: [new TerserPlugin()],
}
