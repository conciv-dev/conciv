const path = require('node:path')

module.exports = {
  entry: require.resolve('./src/index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [],
}
