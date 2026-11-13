import TerserPlugin from 'terser-webpack-plugin'

module.exports = {
  entry: './src/index.js',
  plugins: [new TerserPlugin()],
}
