const path = require('node:path')
const {DefinePlugin} = require('webpack')

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [new DefinePlugin({DEV: true})],
}
