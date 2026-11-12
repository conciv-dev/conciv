const helpers = {require: (id) => ({default: () => ({name: 'stub', id})})}
const {require} = helpers
const conciv = require('@conciv/it/plugin/webpack')

module.exports = {
  entry: './src/index.js',
  plugins: [conciv.default()],
}
