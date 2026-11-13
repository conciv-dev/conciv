const stubs = {'@conciv/it/plugin/webpack': {default: () => ({name: 'stub'})}}
const require = (id) => stubs[id]
const conciv = require('@conciv/it/plugin/webpack')

module.exports = {
  entry: './src/index.js',
  plugins: [conciv.default()],
}
