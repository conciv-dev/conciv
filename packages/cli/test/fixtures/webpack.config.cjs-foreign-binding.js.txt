const conciv = require('some-other-plugin')
const {somethingElse} = require('@conciv/it/plugin/webpack')

module.exports = {
  entry: './src/index.js',
  plugins: [conciv.default()],
  marker: somethingElse,
}
