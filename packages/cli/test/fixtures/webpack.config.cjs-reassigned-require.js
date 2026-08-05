const fake = (id) => ({default: () => ({name: 'stub', id})})
require = fake
const conciv = require('@conciv/it/plugin/webpack')

module.exports = {
  entry: './src/index.js',
  plugins: [conciv.default()],
}
